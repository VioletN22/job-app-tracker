import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  JobApplication,
  Workflow,
  StageHistory,
  GuidanceDoc,
  GuidanceType,
  GuidanceContent,
  ExtractedJobData,
  Attachment,
} from '../shared/types';

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database with all tables and schema
 */
export function initializeDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'job-tracker.db');

  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create workflows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      name TEXT NOT NULL,
      stages TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Create applications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      job_title TEXT NOT NULL,
      location TEXT NOT NULL,
      job_url TEXT NOT NULL,
      salary_min REAL,
      salary_max REAL,
      equity TEXT,
      benefits TEXT,
      job_description TEXT NOT NULL,
      key_responsibilities TEXT NOT NULL,
      required_skills TEXT NOT NULL,
      nice_to_have_skills TEXT NOT NULL,
      team_info TEXT,
      hiring_timeline TEXT,
      application_deadline TEXT,
      current_stage TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    )
  `);

  // Create stage_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      entered_at TEXT NOT NULL,
      exited_at TEXT,
      notes TEXT,
      guidance TEXT,
      outcome TEXT,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // Create guidance_docs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS guidance_docs (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      guidance_type TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // Create attachments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    )
  `);

  // Create indices for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
    CREATE INDEX IF NOT EXISTS idx_applications_stage ON applications(current_stage);
    CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
    CREATE INDEX IF NOT EXISTS idx_stage_history_application_id ON stage_history(application_id);
    CREATE INDEX IF NOT EXISTS idx_guidance_docs_application_id ON guidance_docs(application_id);
    CREATE INDEX IF NOT EXISTS idx_guidance_docs_stage ON guidance_docs(stage);
    CREATE INDEX IF NOT EXISTS idx_attachments_application_id ON attachments(application_id);
  `);
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Workflow CRUD operations

/**
 * Create a new workflow
 */
export function createWorkflow(
  company: string,
  name: string,
  stages: string[],
  isDefault: boolean
): Workflow {
  const database = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const stagesJson = JSON.stringify(stages);

  const stmt = database.prepare(`
    INSERT INTO workflows (id, company, name, stages, is_default, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, company, name, stagesJson, isDefault ? 1 : 0, createdAt);

  return {
    id,
    company,
    name,
    stages,
    is_default: isDefault,
    created_at: createdAt,
  };
}

/**
 * Get a workflow by ID
 */
export function getWorkflow(id: string): Workflow | null {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM workflows WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    company: row.company,
    name: row.name,
    stages: JSON.parse(row.stages),
    is_default: row.is_default === 1,
    created_at: row.created_at,
  };
}

/**
 * Get the default workflow for a company
 */
export function getDefaultWorkflowForCompany(company: string): Workflow | null {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM workflows WHERE company = ? AND is_default = 1 LIMIT 1'
  );
  const row = stmt.get(company) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    company: row.company,
    name: row.name,
    stages: JSON.parse(row.stages),
    is_default: row.is_default === 1,
    created_at: row.created_at,
  };
}

/**
 * Get all workflows
 */
export function getAllWorkflows(): Workflow[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM workflows');
  const rows = stmt.all() as any[];

  return rows.map((row) => ({
    id: row.id,
    company: row.company,
    name: row.name,
    stages: JSON.parse(row.stages),
    is_default: row.is_default === 1,
    created_at: row.created_at,
  }));
}

/**
 * Update a workflow
 */
export function updateWorkflow(
  id: string,
  updates: Partial<Workflow>
): Workflow {
  const database = getDatabase();
  const current = getWorkflow(id);

  if (!current) {
    throw new Error(`Workflow with ID ${id} not found`);
  }

  const updated = { ...current, ...updates };
  const stagesJson = JSON.stringify(updated.stages);

  const stmt = database.prepare(`
    UPDATE workflows
    SET company = ?, name = ?, stages = ?, is_default = ?
    WHERE id = ?
  `);

  stmt.run(updated.company, updated.name, stagesJson, updated.is_default ? 1 : 0, id);

  return updated;
}

/**
 * Delete a workflow
 */
export function deleteWorkflow(id: string): void {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM workflows WHERE id = ?');
  stmt.run(id);
}

// Application CRUD operations

/**
 * Create a new application
 */
export function createApplication(
  extractedData: ExtractedJobData,
  workflowId: string,
  notes: string | null = null
): JobApplication {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO applications (
      id, company, job_title, location, job_url,
      salary_min, salary_max, equity, benefits,
      job_description, key_responsibilities, required_skills, nice_to_have_skills,
      team_info, hiring_timeline, application_deadline,
      current_stage, workflow_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    extractedData.company,
    extractedData.job_title,
    extractedData.location,
    extractedData.job_url,
    extractedData.salary_min ?? null,
    extractedData.salary_max ?? null,
    extractedData.equity ?? null,
    extractedData.benefits ?? null,
    extractedData.job_description,
    extractedData.key_responsibilities,
    extractedData.required_skills,
    extractedData.nice_to_have_skills,
    extractedData.team_info ?? null,
    extractedData.hiring_timeline ?? null,
    extractedData.application_deadline ?? null,
    'applied',
    workflowId,
    notes,
    now,
    now
  );

  return {
    id,
    company: extractedData.company,
    job_title: extractedData.job_title,
    location: extractedData.location,
    job_url: extractedData.job_url,
    salary_min: extractedData.salary_min,
    salary_max: extractedData.salary_max,
    equity: extractedData.equity,
    benefits: extractedData.benefits,
    job_description: extractedData.job_description,
    key_responsibilities: extractedData.key_responsibilities,
    required_skills: extractedData.required_skills,
    nice_to_have_skills: extractedData.nice_to_have_skills,
    team_info: extractedData.team_info,
    hiring_timeline: extractedData.hiring_timeline,
    application_deadline: extractedData.application_deadline,
    current_stage: 'applied',
    workflow_id: workflowId,
    notes,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get an application by ID
 */
export function getApplication(id: string): JobApplication | null {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM applications WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    return null;
  }

  return rowToApplication(row);
}

/**
 * Get all applications with optional filters
 */
export function getAllApplications(filters?: {
  company?: string;
  stage?: string;
  dateFrom?: string;
  dateTo?: string;
}): JobApplication[] {
  const database = getDatabase();
  let query = 'SELECT * FROM applications WHERE 1=1';
  const params: any[] = [];

  if (filters?.company) {
    query += ' AND company = ?';
    params.push(filters.company);
  }

  if (filters?.stage) {
    query += ' AND current_stage = ?';
    params.push(filters.stage);
  }

  if (filters?.dateFrom) {
    query += ' AND created_at >= ?';
    params.push(filters.dateFrom);
  }

  if (filters?.dateTo) {
    query += ' AND created_at <= ?';
    params.push(filters.dateTo);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = database.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map(rowToApplication);
}

/**
 * Update an application
 */
export function updateApplication(
  id: string,
  updates: Partial<JobApplication>
): JobApplication {
  const database = getDatabase();
  const current = getApplication(id);

  if (!current) {
    throw new Error(`Application with ID ${id} not found`);
  }

  const updated = { ...current, ...updates, updated_at: new Date().toISOString() };

  const stmt = database.prepare(`
    UPDATE applications
    SET company = ?, job_title = ?, location = ?, job_url = ?,
        salary_min = ?, salary_max = ?, equity = ?, benefits = ?,
        job_description = ?, key_responsibilities = ?, required_skills = ?,
        nice_to_have_skills = ?, team_info = ?, hiring_timeline = ?,
        application_deadline = ?, current_stage = ?, workflow_id = ?,
        notes = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.company,
    updated.job_title,
    updated.location,
    updated.job_url,
    updated.salary_min ?? null,
    updated.salary_max ?? null,
    updated.equity ?? null,
    updated.benefits ?? null,
    updated.job_description,
    updated.key_responsibilities,
    updated.required_skills,
    updated.nice_to_have_skills,
    updated.team_info ?? null,
    updated.hiring_timeline ?? null,
    updated.application_deadline ?? null,
    updated.current_stage,
    updated.workflow_id,
    updated.notes ?? null,
    updated.updated_at,
    id
  );

  return updated;
}

/**
 * Delete an application and all related records
 */
export function deleteApplication(id: string): void {
  const database = getDatabase();

  // Delete all related records first (cascade delete)
  database.prepare('DELETE FROM stage_history WHERE application_id = ?').run(id);
  database.prepare('DELETE FROM guidance_docs WHERE application_id = ?').run(id);
  database.prepare('DELETE FROM attachments WHERE application_id = ?').run(id);

  // Then delete the application itself
  database.prepare('DELETE FROM applications WHERE id = ?').run(id);
}

// Stage History CRUD operations

/**
 * Create a stage history entry
 */
export function createStageHistory(
  applicationId: string,
  stage: string,
  notes: string | null = null,
  guidance: string | null = null
): StageHistory {
  const database = getDatabase();
  const id = randomUUID();
  const enteredAt = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO stage_history (
      id, application_id, stage, entered_at, exited_at, notes, guidance, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, applicationId, stage, enteredAt, null, notes, guidance, null);

  return {
    id,
    application_id: applicationId,
    stage,
    entered_at: enteredAt,
    exited_at: null,
    notes,
    guidance,
    outcome: null,
  };
}

/**
 * Get stage history for an application
 */
export function getStageHistoryForApplication(applicationId: string): StageHistory[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM stage_history WHERE application_id = ? ORDER BY entered_at ASC'
  );
  const rows = stmt.all(applicationId) as any[];

  return rows.map(rowToStageHistory);
}

/**
 * Update a stage history entry
 */
export function updateStageHistory(
  id: string,
  updates: Partial<StageHistory>
): StageHistory {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM stage_history WHERE id = ?'
  );
  const row = stmt.get(id) as any;

  if (!row) {
    throw new Error(`Stage history with ID ${id} not found`);
  }

  const current = rowToStageHistory(row);
  const updated = { ...current, ...updates };

  const updateStmt = database.prepare(`
    UPDATE stage_history
    SET stage = ?, entered_at = ?, exited_at = ?, notes = ?, guidance = ?, outcome = ?
    WHERE id = ?
  `);

  updateStmt.run(
    updated.stage,
    updated.entered_at,
    updated.exited_at ?? null,
    updated.notes ?? null,
    updated.guidance ?? null,
    updated.outcome ?? null,
    id
  );

  return updated;
}

// Guidance Docs CRUD operations

/**
 * Create guidance documents for an application and stage
 */
export function createGuidanceDocs(
  applicationId: string,
  stage: string,
  content: GuidanceContent
): GuidanceDoc[] {
  const database = getDatabase();
  const generatedAt = new Date().toISOString();
  const guidanceDocs: GuidanceDoc[] = [];

  const guidanceTypes: GuidanceType[] = [
    'interview_prep',
    'company_research',
    'application_strategy',
    'follow_up_template',
  ];

  const stmt = database.prepare(`
    INSERT INTO guidance_docs (
      id, application_id, stage, guidance_type, content, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const guidanceType of guidanceTypes) {
    const id = randomUUID();
    const contentValue = content[guidanceType];

    if (contentValue) {
      stmt.run(id, applicationId, stage, guidanceType, contentValue, generatedAt);

      guidanceDocs.push({
        id,
        application_id: applicationId,
        stage,
        guidance_type: guidanceType,
        content: contentValue,
        generated_at: generatedAt,
      });
    }
  }

  return guidanceDocs;
}

/**
 * Get guidance docs for an application and stage
 */
export function getGuidanceDocsForApplicationAndStage(
  applicationId: string,
  stage: string
): GuidanceDoc[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM guidance_docs WHERE application_id = ? AND stage = ? ORDER BY generated_at DESC'
  );
  const rows = stmt.all(applicationId, stage) as any[];

  return rows.map(rowToGuidanceDoc);
}

/**
 * Get all guidance docs for an application
 */
export function getAllGuidanceDocsForApplication(applicationId: string): GuidanceDoc[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM guidance_docs WHERE application_id = ? ORDER BY generated_at DESC'
  );
  const rows = stmt.all(applicationId) as any[];

  return rows.map(rowToGuidanceDoc);
}

// Helper functions for converting database rows to typed objects

function rowToApplication(row: any): JobApplication {
  return {
    id: row.id,
    company: row.company,
    job_title: row.job_title,
    location: row.location,
    job_url: row.job_url,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    equity: row.equity,
    benefits: row.benefits,
    job_description: row.job_description,
    key_responsibilities: row.key_responsibilities,
    required_skills: row.required_skills,
    nice_to_have_skills: row.nice_to_have_skills,
    team_info: row.team_info,
    hiring_timeline: row.hiring_timeline,
    application_deadline: row.application_deadline,
    current_stage: row.current_stage,
    workflow_id: row.workflow_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToStageHistory(row: any): StageHistory {
  return {
    id: row.id,
    application_id: row.application_id,
    stage: row.stage,
    entered_at: row.entered_at,
    exited_at: row.exited_at,
    notes: row.notes,
    guidance: row.guidance,
    outcome: row.outcome,
  };
}

function rowToGuidanceDoc(row: any): GuidanceDoc {
  return {
    id: row.id,
    application_id: row.application_id,
    stage: row.stage,
    guidance_type: row.guidance_type,
    content: row.content,
    generated_at: row.generated_at,
  };
}

// Attachment CRUD operations

/**
 * Create an attachment for an application
 */
export function createAttachment(
  applicationId: string,
  fileName: string,
  fileType: string,
  filePath: string
): Attachment {
  const database = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO attachments (id, application_id, file_name, file_type, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, applicationId, fileName, fileType, filePath, createdAt);

  return {
    id,
    application_id: applicationId,
    file_name: fileName,
    file_type: fileType,
    file_path: filePath,
    created_at: createdAt,
  };
}

/**
 * Get all attachments for an application
 */
export function getAttachmentsForApplication(applicationId: string): Attachment[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM attachments WHERE application_id = ? ORDER BY created_at DESC'
  );
  const rows = stmt.all(applicationId) as any[];

  return rows.map((row) => ({
    id: row.id,
    application_id: row.application_id,
    file_name: row.file_name,
    file_type: row.file_type,
    file_path: row.file_path,
    created_at: row.created_at,
  }));
}

/**
 * Delete an attachment
 */
export function deleteAttachment(id: string): void {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM attachments WHERE id = ?');
  stmt.run(id);
}
