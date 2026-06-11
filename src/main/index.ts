import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';

// Simple dev check without ESM import
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
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
  createAttachment,
  getAttachmentsForApplication,
  deleteAttachment,
  addChatMessage,
  getChatMessages,
} from './database';
import { extractJobListing, generateGuidance, runClaudeCLI, chatAboutApplication } from './claude';
import { JobApplication, Workflow, ExtractedJobData } from '../shared/types';

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

// Attachment Operations IPC Handlers

/**
 * Add an attachment to an application
 */
ipcMain.handle('attachment:add', async (_event, applicationId: string, filePath: string) => {
  try {
    const fs = require('fs');
    const path = require('path');

    // Get file info
    const fileName = path.basename(filePath);
    const fileType = path.extname(filePath).substring(1) || 'unknown';

    // Copy file to app data directory
    const appPath = app.getPath('userData');
    const attachmentsDir = path.join(appPath, 'attachments', applicationId);

    // Ensure directory exists
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    const destPath = path.join(attachmentsDir, `${Date.now()}-${fileName}`);
    fs.copyFileSync(filePath, destPath);

    // Create attachment record in database
    const attachment = createAttachment(applicationId, fileName, fileType, destPath);

    return {
      success: true,
      attachment,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Get attachments for an application
 */
ipcMain.handle('attachment:getAll', async (_event, applicationId: string) => {
  try {
    const attachments = getAttachmentsForApplication(applicationId);
    return {
      success: true,
      attachments,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Delete an attachment
 */
ipcMain.handle('attachment:delete', async (_event, attachmentId: string) => {
  try {
    deleteAttachment(attachmentId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// Claude Operations IPC Handler

/**
 * Orchestrate the entire job listing ingestion workflow
 */
ipcMain.handle('claude:ingestJobListing', async (_event, jobListingText: string, company: string) => {
  console.log('[Extract with AI] Starting job listing ingestion');
  try {
    // Step 1: Extract job listing data
    let extractedData: ExtractedJobData;
    try {
      console.log('[Extract with AI] Calling extractJobListing...');
      extractedData = await extractJobListing(jobListingText);
      console.log('[Extract with AI] Successfully extracted:', extractedData.company, extractedData.job_title);
    } catch (claudeError) {
      // If Claude extraction fails, create basic data from the input
      // This allows Quick Add via paste to still work
      const errorMsg = claudeError instanceof Error ? claudeError.message : String(claudeError);
      console.error('[Extract with AI] Extraction error:', errorMsg, claudeError);

      // Try to extract company from input if not provided
      const finalCompany = company && company !== 'Unknown Company' ? company : 'Unknown Company';

      // Create minimal data - user can edit later
      extractedData = {
        company: finalCompany,
        job_title: 'Job Title (edit me)',
        location: '',
        job_url: '',
        salary_min: null,
        salary_max: null,
        equity: null,
        benefits: null,
        job_description: jobListingText || 'Job details to be filled in',
        key_responsibilities: '',
        required_skills: '',
        nice_to_have_skills: '',
        team_info: null,
        hiring_timeline: null,
        application_deadline: null,
      };
    }

    // Step 2: Get or create default workflow for company
    let workflow = getDefaultWorkflowForCompany(extractedData.company);
    if (!workflow) {
      workflow = createWorkflow(
        extractedData.company,
        `${extractedData.company} Default Workflow`,
        ['started', 'applied', 'phone_screen', 'interview', 'offer'],
        true
      );
    }

    // Step 3: Create application with extracted data
    const application = createApplication(extractedData, workflow.id);

    // Step 4: Initial stage history entry (start with 'started' status).
    // No upfront guidance generation - the per-application chat assistant
    // covers that on demand, which keeps ingest fast.
    createStageHistory(application.id, 'started', 'Application added');

    console.log('[Extract with AI] Success! Created application:', application.id);
    return {
      success: true,
      application,
      workflow,
    };
  } catch (error) {
    console.error('[Extract with AI] Fatal error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
    };
  }
});

/**
 * Check if Claude is authenticated by running the Claude CLI
 * (subscription auth from `claude login` - same approach as Inkd)
 */
ipcMain.handle('claude:checkAuth', async () => {
  try {
    console.log('[Claude Auth] Testing authentication via Claude CLI...');

    const reply = await runClaudeCLI('Reply with exactly: ok', 60000);
    console.log('[Claude Auth] ✓ CLI replied:', reply.slice(0, 100));

    return {
      authenticated: true,
      tokenPath: null,
      method: 'subscription (claude CLI)',
    };
  } catch (error) {
    console.error('[Claude Auth] CLI authentication test failed:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);

    return {
      authenticated: false,
      tokenPath: null,
      error: errorMsg,
    };
  }
});

/**
 * Get chat history for an application
 */
ipcMain.handle('chat:getMessages', async (_event, applicationId: string) => {
  try {
    return getChatMessages(applicationId);
  } catch (error) {
    throw new Error(`Failed to get chat messages: ${error}`);
  }
});

/**
 * Send a chat message about an application.
 * Injects the application context so Claude already knows the job.
 */
ipcMain.handle('chat:send', async (_event, applicationId: string, message: string) => {
  try {
    const application = getApplication(applicationId);
    if (!application) {
      return { success: false, error: 'Application not found' };
    }

    const history = getChatMessages(applicationId).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const appContext = [
      `Company: ${application.company}`,
      `Role: ${application.job_title}`,
      application.location ? `Location: ${application.location}` : '',
      `Current stage: ${application.current_stage}`,
      application.salary_min || application.salary_max
        ? `Salary: ${application.salary_min ?? '?'} - ${application.salary_max ?? '?'}`
        : '',
      `Description: ${application.job_description.slice(0, 1500)}`,
      application.key_responsibilities ? `Responsibilities: ${application.key_responsibilities}` : '',
      application.required_skills ? `Required skills: ${application.required_skills}` : '',
      application.notes ? `User's own notes: ${application.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const reply = await chatAboutApplication(appContext, history, message);

    // Persist both turns
    const userMsg = addChatMessage(applicationId, 'user', message);
    const assistantMsg = addChatMessage(applicationId, 'assistant', reply);

    return { success: true, userMessage: userMsg, assistantMessage: assistantMsg };
  } catch (error) {
    console.error('[Chat] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Quick add an application with just company and job title
 */
ipcMain.handle('quickAddApplication', async (_event, company: string, jobTitle: string) => {
  try {
    // Get or create default workflow for company
    let workflow = getDefaultWorkflowForCompany(company);
    if (!workflow) {
      workflow = createWorkflow(company, `${company} Default Workflow`, ['started', 'applied', 'phone_screen', 'interview', 'offer'], true);
    }

    // Create minimal application entry
    const minimalData: ExtractedJobData = {
      company,
      job_title: jobTitle,
      location: '',
      job_url: '',
      salary_min: null,
      salary_max: null,
      equity: null,
      benefits: null,
      job_description: 'Job details to be added. You can paste the job description or link later and Claude will extract all the details.',
      key_responsibilities: '',
      required_skills: '',
      nice_to_have_skills: '',
      team_info: null,
      hiring_timeline: null,
      application_deadline: null,
    };

    const application = createApplication(minimalData, workflow.id);

    // Create initial stage history entry (start with 'started' status)
    createStageHistory(application.id, 'started', 'Quick added - details to be filled in');

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
