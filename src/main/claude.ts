import Anthropic from "@anthropic-ai/sdk";
import { ExtractedJobData, GuidanceContent } from "../shared/types";
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Polyfill fetch, Headers, and FormData if not available (for Electron environment)
if (!globalThis.fetch) {
  const fetch = require('node-fetch');
  globalThis.fetch = fetch;
  globalThis.Headers = fetch.Headers;
  globalThis.FormData = require('form-data');
  globalThis.Response = fetch.Response;
  globalThis.Request = fetch.Request;
}

// Claude authentication using session tokens (like Claude CLI)
let client: Anthropic | null = null;

function getStoredAuthToken(): string | null {
  try {
    // Check multiple possible Claude CLI token locations
    const homeDir = app.getPath('home');
    const possiblePaths = [
      // macOS
      path.join(homeDir, 'Library', 'Application Support', 'Claude', 'auth.json'),
      path.join(homeDir, '.config', 'claude', 'auth.json'),
      // Linux/other
      path.join(homeDir, '.claude', 'auth.json'),
      path.join(homeDir, '.claude', 'auth-token'),
      // Windows
      path.join(homeDir, 'AppData', 'Local', 'Claude', 'auth.json'),
    ];

    console.log('[Claude Auth] Checking token locations:');
    console.log('[Claude Auth] Home directory:', homeDir);

    for (const tokenPath of possiblePaths) {
      console.log('[Claude Auth] Checking:', tokenPath, 'exists:', fs.existsSync(tokenPath));

      if (fs.existsSync(tokenPath)) {
        try {
          const content = fs.readFileSync(tokenPath, 'utf-8').trim();
          console.log('[Claude Auth] Found file at:', tokenPath);
          console.log('[Claude Auth] File size:', content.length, 'bytes');

          // If it's JSON, extract the token
          if (content.startsWith('{')) {
            try {
              const data = JSON.parse(content);
              const token = data.token || data.apiKey || data.authToken;
              if (token) {
                console.log('[Claude Auth] ✓ Found token in JSON at:', tokenPath);
                return token;
              }
            } catch (e) {
              console.log('[Claude Auth] JSON parse error:', e);
              // Not valid JSON, try as plain token
              if (content) {
                console.log('[Claude Auth] ✓ Using as plain text token from:', tokenPath);
                return content;
              }
            }
          } else if (content) {
            // Plain text token
            console.log('[Claude Auth] ✓ Using plain text token from:', tokenPath);
            return content;
          }
        } catch (err) {
          console.log('[Claude Auth] Error reading file:', err);
        }
      }
    }

    console.log('[Claude Auth] ✗ No token found in any location');
  } catch (error) {
    console.error('[Claude Auth] Error:', error);
  }
  return null;
}


function getClient(): Anthropic {
  if (!client) {
    // Try to get stored session token (from claude login)
    const sessionToken = getStoredAuthToken();

    if (sessionToken) {
      // Use stored session token
      client = new Anthropic({
        apiKey: sessionToken,
      });
    } else {
      // No token found - user needs to authenticate
      throw new Error(
        'Claude authentication required.\n\n' +
        'To set up Extract with AI, authenticate with Claude:\n' +
        '  claude login\n\n' +
        'Then restart the app. Your subscription will be used for AI features.'
      );
    }
  }
  return client;
}

/**
 * Extracts structured job data from raw job listing text
 * Supports text paste, PDF extraction, or OCR output
 */
export async function extractJobListing(
  jobListingText: string
): Promise<ExtractedJobData> {
  const extractionPrompt = `You are a job listing data extraction specialist. Extract structured data from the following job listing text.

Return ONLY a valid JSON object with these fields (use null for missing values):
- company (string): Company name
- job_title (string): Job title
- location (string): Job location
- job_url (string): URL to the job listing (use empty string if not found)
- salary_min (number or null): Minimum salary in USD
- salary_max (number or null): Maximum salary in USD
- equity (string or null): Equity information if mentioned
- benefits (string or null): Benefits summary
- job_description (string): Full job description
- key_responsibilities (string): Key responsibilities (comma-separated or bullet points)
- required_skills (string): Required skills and qualifications
- nice_to_have_skills (string): Nice-to-have skills
- team_info (string or null): Information about the team
- hiring_timeline (string or null): Timeline for hiring process
- application_deadline (string or null): Application deadline if mentioned

Job listing text:
${jobListingText}

Return ONLY the JSON object, no other text.`;

  const response = await getClient().messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: extractionPrompt,
      },
    ],
  });

  // Extract text from response
  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  // Parse JSON response
  let extractedData: ExtractedJobData;
  try {
    extractedData = JSON.parse(textContent.text);
  } catch (error) {
    throw new Error(
      `Failed to parse Claude extraction response as JSON: ${textContent.text}. Error: ${error}`
    );
  }

  // Validate required fields
  const requiredFields: (keyof ExtractedJobData)[] = [
    "company",
    "job_title",
    "location",
    "job_url",
    "job_description",
    "key_responsibilities",
    "required_skills",
    "nice_to_have_skills",
  ];

  for (const field of requiredFields) {
    if (!extractedData[field]) {
      throw new Error(
        `Missing required field in extraction: ${field}. Response: ${textContent.text}`
      );
    }
  }

  // Ensure salary fields are numbers or null
  if (extractedData.salary_min !== null && extractedData.salary_min !== undefined) {
    extractedData.salary_min = Number(extractedData.salary_min);
  } else {
    extractedData.salary_min = null;
  }

  if (extractedData.salary_max !== null && extractedData.salary_max !== undefined) {
    extractedData.salary_max = Number(extractedData.salary_max);
  } else {
    extractedData.salary_max = null;
  }

  return extractedData;
}

/**
 * Generates stage-specific guidance documents for a job application
 */
export async function generateGuidance(
  company: string,
  jobTitle: string,
  location: string,
  jobDescription: string,
  keyResponsibilities: string,
  requiredSkills: string
): Promise<GuidanceContent> {
  const guidancePrompt = `You are an expert career coach specializing in job applications and interview preparation. Generate comprehensive guidance for a candidate applying to a specific role.

Company: ${company}
Job Title: ${jobTitle}
Location: ${location}

Job Description:
${jobDescription}

Key Responsibilities:
${keyResponsibilities}

Required Skills:
${requiredSkills}

Generate guidance in JSON format with these four sections (300-500 words each for the first three, 200-300 words for the template):

1. interview_prep: Specific interview preparation tips for this role and company, including potential question topics and how to showcase relevant experience.

2. company_research: Key insights about the company that the candidate should research and understand, including industry position, culture, and values.

3. application_strategy: A strategic approach for crafting a strong application, including how to highlight relevant skills and frame experience for this specific role.

4. follow_up_template: An email template for follow-up after submitting the application, including placeholder text.

Return ONLY this JSON object:
{
  "interview_prep": "...",
  "company_research": "...",
  "application_strategy": "...",
  "follow_up_template": "..."
}

No other text, only valid JSON.`;

  const response = await getClient().messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: guidancePrompt,
      },
    ],
  });

  // Extract text from response
  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude guidance response");
  }

  // Parse JSON response
  let guidanceData: GuidanceContent;
  try {
    guidanceData = JSON.parse(textContent.text);
  } catch (error) {
    throw new Error(
      `Failed to parse Claude guidance response as JSON: ${textContent.text}. Error: ${error}`
    );
  }

  // Validate all required guidance sections are present
  const requiredSections: (keyof GuidanceContent)[] = [
    "interview_prep",
    "company_research",
    "application_strategy",
    "follow_up_template",
  ];

  for (const section of requiredSections) {
    if (!guidanceData[section] || typeof guidanceData[section] !== "string") {
      throw new Error(
        `Missing or invalid guidance section: ${section}. Response: ${textContent.text}`
      );
    }
  }

  return guidanceData;
}
