// Shared TypeScript types for Job Application Tracker

/**
 * Represents a job application with all relevant information
 */
export interface JobApplication {
  id: string;
  company: string;
  job_title: string;
  location: string;
  job_url: string;
  salary_min: number | null;
  salary_max: number | null;
  equity: string | null;
  benefits: string | null;
  job_description: string;
  key_responsibilities: string;
  required_skills: string;
  nice_to_have_skills: string;
  team_info: string | null;
  hiring_timeline: string | null;
  application_deadline: string | null;
  current_stage: string;
  workflow_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents a workflow template with stages
 */
export interface Workflow {
  id: string;
  company: string;
  name: string;
  stages: string[];
  is_default: boolean;
  created_at: string;
}

/**
 * Represents the history of stage transitions for an application
 */
export interface StageHistory {
  id: string;
  application_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
  notes: string | null;
  guidance: string | null;
  outcome: string | null;
}

/**
 * Type for guidance document types
 */
export type GuidanceType = 'interview_prep' | 'company_research' | 'application_strategy' | 'follow_up_template';

/**
 * Represents a guidance document for an application stage
 */
export interface GuidanceDoc {
  id: string;
  application_id: string;
  stage: string;
  guidance_type: GuidanceType;
  content: string;
  generated_at: string;
}

/**
 * Represents job data extracted from a job listing
 * (without application-specific fields like id, current_stage, workflow_id, notes, created_at, updated_at)
 */
export interface ExtractedJobData {
  company: string;
  job_title: string;
  location: string;
  job_url: string;
  salary_min: number | null;
  salary_max: number | null;
  equity: string | null;
  benefits: string | null;
  job_description: string;
  key_responsibilities: string;
  required_skills: string;
  nice_to_have_skills: string;
  team_info: string | null;
  hiring_timeline: string | null;
  application_deadline: string | null;
}

/**
 * Represents content for guidance documents
 */
export interface GuidanceContent {
  interview_prep: string;
  company_research: string;
  application_strategy: string;
  follow_up_template: string;
}

/**
 * Represents an attachment (screenshot, image, PDF, etc.)
 */
export interface Attachment {
  id: string;
  application_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  created_at: string;
}
