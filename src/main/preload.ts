import { contextBridge, ipcRenderer } from 'electron';
import { JobApplication, Workflow } from '../shared/types';

// Define the API object
const electronAPI = {
  // Database operations
  db: {
    getAllApplications: (filters?: any) => ipcRenderer.invoke('db:getAllApplications', filters),
    getApplication: (id: string) => ipcRenderer.invoke('db:getApplication', id),
    updateApplication: (id: string, updates: Partial<JobApplication>) =>
      ipcRenderer.invoke('db:updateApplication', id, updates),
    deleteApplication: (id: string) => ipcRenderer.invoke('db:deleteApplication', id),
    getStageHistory: (applicationId: string) =>
      ipcRenderer.invoke('db:getStageHistory', applicationId),
    createStageHistory: (applicationId: string, stage: string, notes?: string) =>
      ipcRenderer.invoke('db:createStageHistory', applicationId, stage, notes),
    updateStageHistory: (id: string, updates: any) =>
      ipcRenderer.invoke('db:updateStageHistory', id, updates),
    getGuidanceDocs: (applicationId: string, stage: string) =>
      ipcRenderer.invoke('db:getGuidanceDocs', applicationId, stage),
    getAllWorkflows: () => ipcRenderer.invoke('db:getAllWorkflows'),
    createWorkflow: (company: string, name: string, stages: string[], isDefault: boolean) =>
      ipcRenderer.invoke('db:createWorkflow', company, name, stages, isDefault),
    updateWorkflow: (id: string, updates: Partial<Workflow>) =>
      ipcRenderer.invoke('db:updateWorkflow', id, updates),
    deleteWorkflow: (id: string) => ipcRenderer.invoke('db:deleteWorkflow', id),
  },

  // File operations
  file: {
    selectFile: () => ipcRenderer.invoke('file:selectFile'),
  },

  // Claude operations
  claude: {
    ingestJobListing: (jobListingText: string, company: string) =>
      ipcRenderer.invoke('claude:ingestJobListing', jobListingText, company),
  },

  // Quick add operation
  quickAddApplication: (company: string, jobTitle: string) =>
    ipcRenderer.invoke('quickAddApplication', company, jobTitle),

  // Attachment operations
  attachment: {
    add: (applicationId: string, filePath: string) =>
      ipcRenderer.invoke('attachment:add', applicationId, filePath),
    getAll: (applicationId: string) =>
      ipcRenderer.invoke('attachment:getAll', applicationId),
    delete: (attachmentId: string) =>
      ipcRenderer.invoke('attachment:delete', attachmentId),
  },

  // Legacy shortcuts for backwards compatibility
  getAllApplications: (filters?: any) => ipcRenderer.invoke('db:getAllApplications', filters),
  selectFile: () => ipcRenderer.invoke('file:selectFile'),
};

// Expose in main world
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
