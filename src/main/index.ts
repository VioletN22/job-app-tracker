import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import {
  initializeDatabase,
  closeDatabase,
  getAllApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  getStageHistoryForApplication,
  createStageHistory,
  updateStageHistory,
  getGuidanceDocsForApplicationAndStage,
  getAllWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createApplication,
  createGuidanceDocs,
  getDefaultWorkflowForCompany,
} from './database';
import { extractJobListing, generateGuidance } from './claude';
import { JobApplication, Workflow } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../renderer/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Electron lifecycle: when app is ready
 */
app.on('ready', () => {
  initializeDatabase();
  createWindow();
});

/**
 * Electron lifecycle: when all windows are closed
 */
app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Electron lifecycle: when app is activated (macOS)
 */
app.on('activate', () => {
  if (mainWindow === null) {
    initializeDatabase();
    createWindow();
  }
});

// Database IPC Handlers

/**
 * Get all applications with optional filters
 */
ipcMain.handle('db:getAllApplications', async (_event, filters?) => {
  try {
    return getAllApplications(filters);
  } catch (error) {
    throw new Error(`Failed to get applications: ${error}`);
  }
});

/**
 * Get a single application by ID
 */
ipcMain.handle('db:getApplication', async (_event, id: string) => {
  try {
    return getApplication(id);
  } catch (error) {
    throw new Error(`Failed to get application: ${error}`);
  }
});

/**
 * Update an application
 */
ipcMain.handle('db:updateApplication', async (_event, id: string, updates: Partial<JobApplication>) => {
  try {
    return updateApplication(id, updates);
  } catch (error) {
    throw new Error(`Failed to update application: ${error}`);
  }
});

/**
 * Delete an application
 */
ipcMain.handle('db:deleteApplication', async (_event, id: string) => {
  try {
    deleteApplication(id);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete application: ${error}`);
  }
});

/**
 * Get stage history for an application
 */
ipcMain.handle('db:getStageHistory', async (_event, applicationId: string) => {
  try {
    return getStageHistoryForApplication(applicationId);
  } catch (error) {
    throw new Error(`Failed to get stage history: ${error}`);
  }
});

/**
 * Create a stage history entry
 */
ipcMain.handle('db:createStageHistory', async (_event, applicationId: string, stage: string, notes?: string) => {
  try {
    return createStageHistory(applicationId, stage, notes || null);
  } catch (error) {
    throw new Error(`Failed to create stage history: ${error}`);
  }
});

/**
 * Update a stage history entry
 */
ipcMain.handle('db:updateStageHistory', async (_event, id: string, updates: any) => {
  try {
    return updateStageHistory(id, updates);
  } catch (error) {
    throw new Error(`Failed to update stage history: ${error}`);
  }
});

/**
 * Get guidance docs for an application and stage
 */
ipcMain.handle('db:getGuidanceDocs', async (_event, applicationId: string, stage: string) => {
  try {
    return getGuidanceDocsForApplicationAndStage(applicationId, stage);
  } catch (error) {
    throw new Error(`Failed to get guidance docs: ${error}`);
  }
});

// Workflow IPC Handlers

/**
 * Get all workflows
 */
ipcMain.handle('db:getAllWorkflows', async (_event) => {
  try {
    return getAllWorkflows();
  } catch (error) {
    throw new Error(`Failed to get workflows: ${error}`);
  }
});

/**
 * Create a new workflow
 */
ipcMain.handle('db:createWorkflow', async (_event, company: string, name: string, stages: string[], isDefault: boolean) => {
  try {
    return createWorkflow(company, name, stages, isDefault);
  } catch (error) {
    throw new Error(`Failed to create workflow: ${error}`);
  }
});

/**
 * Update a workflow
 */
ipcMain.handle('db:updateWorkflow', async (_event, id: string, updates: Partial<Workflow>) => {
  try {
    return updateWorkflow(id, updates);
  } catch (error) {
    throw new Error(`Failed to update workflow: ${error}`);
  }
});

/**
 * Delete a workflow
 */
ipcMain.handle('db:deleteWorkflow', async (_event, id: string) => {
  try {
    deleteWorkflow(id);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete workflow: ${error}`);
  }
});

// File Operations IPC Handler

/**
 * Open file dialog and return file content
 */
ipcMain.handle('file:selectFile', async (_event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      filePath,
      content,
    };
  } catch (error) {
    throw new Error(`Failed to select file: ${error}`);
  }
});

// Claude Operations IPC Handler

/**
 * Orchestrate the entire job listing ingestion workflow
 */
ipcMain.handle('claude:ingestJobListing', async (_event, jobListingText: string, company: string) => {
  try {
    // Step 1: Extract job listing data
    const extractedData = await extractJobListing(jobListingText);

    // Step 2: Get or create default workflow for company
    let workflow = getDefaultWorkflowForCompany(company);
    if (!workflow) {
      workflow = createWorkflow(company, `${company} Default Workflow`, ['applied', 'phone_screen', 'interview', 'offer'], true);
    }

    // Step 3: Create application with extracted data
    const application = createApplication(extractedData, workflow.id);

    // Step 4: Generate guidance for all stages
    const guidanceContent = await generateGuidance(
      extractedData.company,
      extractedData.job_title,
      extractedData.location,
      extractedData.job_description,
      extractedData.key_responsibilities,
      extractedData.required_skills
    );

    // Step 5: Create guidance docs for each stage in workflow
    for (const stage of workflow.stages) {
      createGuidanceDocs(application.id, stage, guidanceContent);
    }

    // Step 6: Create initial stage history entry
    createStageHistory(application.id, 'applied', 'Application ingested and processed');

    return {
      success: true,
      application,
      workflow,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
