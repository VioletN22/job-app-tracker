import { contextBridge, ipcRenderer } from 'electron';
import { JobApplication, Workflow, AnswerBankEntry, LockerDocument, VoiceNote, VoiceNoteKind, PortfolioLink, CoverLetter, AutopilotJob, AutopilotNeed, DriveStatus } from '../shared/types';

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
    ingestJobListing: (jobListingText: string, company: string, jobSource?: string | null) =>
      ipcRenderer.invoke('claude:ingestJobListing', jobListingText, company, jobSource ?? null),
    checkAuth: () => ipcRenderer.invoke('claude:checkAuth'),
  },

  // Application flow (Sankey) data
  flow: {
    getData: () => ipcRenderer.invoke('flow:getData'),
  },

  // purpl hq license
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },

  // Per-application chat assistant
  chat: {
    getMessages: (applicationId: string) => ipcRenderer.invoke('chat:getMessages', applicationId),
    send: (applicationId: string, message: string) =>
      ipcRenderer.invoke('chat:send', applicationId, message),
  },

  // Autopilot: answer bank / document locker / voice profile
  autopilot: {
    getAnswerBank: (): Promise<AnswerBankEntry[]> => ipcRenderer.invoke('autopilot:getAnswerBank'),
    upsertAnswer: (entry: Partial<AnswerBankEntry> & { label: string; value: string }): Promise<AnswerBankEntry> =>
      ipcRenderer.invoke('autopilot:upsertAnswer', entry),
    deleteAnswer: (id: string) => ipcRenderer.invoke('autopilot:deleteAnswer', id),
    getDocuments: (): Promise<LockerDocument[]> => ipcRenderer.invoke('autopilot:getDocuments'),
    pickDocument: (): Promise<string | null> => ipcRenderer.invoke('autopilot:pickDocument'),
    addDocument: (label: string, filePath: string, tags: string[], isDefault: boolean): Promise<LockerDocument> =>
      ipcRenderer.invoke('autopilot:addDocument', label, filePath, tags, isDefault),
    deleteDocument: (id: string) => ipcRenderer.invoke('autopilot:deleteDocument', id),
    getVoiceNotes: (): Promise<VoiceNote[]> => ipcRenderer.invoke('autopilot:getVoiceNotes'),
    addVoiceNote: (kind: VoiceNoteKind, note: string): Promise<VoiceNote> =>
      ipcRenderer.invoke('autopilot:addVoiceNote', kind, note),
    deleteVoiceNote: (id: string) => ipcRenderer.invoke('autopilot:deleteVoiceNote', id),
    getPortfolioLinks: (): Promise<PortfolioLink[]> => ipcRenderer.invoke('autopilot:getPortfolioLinks'),
    addPortfolioLink: (label: string, url: string): Promise<PortfolioLink> =>
      ipcRenderer.invoke('autopilot:addPortfolioLink', label, url),
    deletePortfolioLink: (id: string) => ipcRenderer.invoke('autopilot:deletePortfolioLink', id),
    getCoverLetters: (): Promise<CoverLetter[]> => ipcRenderer.invoke('autopilot:getCoverLetters'),
    saveCoverLetter: (input: Partial<CoverLetter> & { company: string; role: string; body: string }): Promise<CoverLetter> =>
      ipcRenderer.invoke('autopilot:saveCoverLetter', input),
    deleteCoverLetter: (id: string) => ipcRenderer.invoke('autopilot:deleteCoverLetter', id),
    generateCoverLetter: (opts: { company: string; role: string; jobText?: string }): Promise<{ body: string }> =>
      ipcRenderer.invoke('autopilot:generateCoverLetter', opts),
    refineCoverLetter: (opts: { company: string; role: string; body: string; feedback: string; remember?: boolean }): Promise<{ body: string }> =>
      ipcRenderer.invoke('autopilot:refineCoverLetter', opts),
  },

  // Autopilot autonomous drive (the cockpit)
  drive: {
    enqueue: (urls: string[]): Promise<{ added: number; jobs: AutopilotJob[] }> =>
      ipcRenderer.invoke('autopilot:drive:enqueue', urls),
    run: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('autopilot:drive:run'),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('autopilot:drive:stop'),
    getJobs: (): Promise<AutopilotJob[]> => ipcRenderer.invoke('autopilot:drive:getJobs'),
    getNeeds: (): Promise<AutopilotNeed[]> => ipcRenderer.invoke('autopilot:drive:getNeeds'),
    answerNeed: (id: string, value: string): Promise<{ ok: boolean; need: AutopilotNeed | null }> =>
      ipcRenderer.invoke('autopilot:drive:answerNeed', id, value),
    approve: (jobId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('autopilot:drive:approve', jobId),
    approveAll: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('autopilot:drive:approveAll'),
    deleteJob: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('autopilot:drive:deleteJob', id),
    clearFinished: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('autopilot:drive:clearFinished'),
    status: (): Promise<{ running: boolean; jobs: AutopilotJob[]; needs: AutopilotNeed[] }> =>
      ipcRenderer.invoke('autopilot:drive:status'),
    shot: (filePath: string): Promise<string | null> => ipcRenderer.invoke('autopilot:drive:shot', filePath),
    onProgress: (cb: (status: DriveStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: DriveStatus) => cb(status);
      ipcRenderer.on('autopilot:drive:progress', handler);
      return () => ipcRenderer.removeListener('autopilot:drive:progress', handler);
    },
  },

  // Quick add operation
  quickAddApplication: (company: string, jobTitle: string, jobSource?: string | null) =>
    ipcRenderer.invoke('quickAddApplication', company, jobTitle, jobSource ?? null),

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
