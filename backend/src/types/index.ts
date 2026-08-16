/**
 * TypeScript Type Definitions for ResumeIQ
 * 
 * Centralized types used across the application
 */

// ============================================
// Resume Types
// ============================================

export interface IResume {
  id: string;
  userId: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  parseStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  parseStartedAt?: Date | null;
  parsedAt?: Date | null;
  parseError?: string | null;
  extractedText: string | null;
  extractedLayout: ILayoutMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILayoutMetadata {
  sections: ISection[];
  fonts: IFont[];
  colors: string[];
  pageCount: number;
  hasMultipleColumns: boolean;
  hasImages: boolean;
  hasTables: boolean;
}

export type ResumeType = 'fresher' | 'experienced' | 'technical' | 'academic' | 'other';
export type ParsedSectionType =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'other';

export interface IParsedResume {
  sourceType: 'pdf' | 'docx';
  rawText: string;
  contact: IContactInfo;
  summary?: string;
  skills: string[];
  experience: IExperienceItem[];
  education: IEducationItem[];
  projects: IProjectItem[];
  certifications: ICertificationItem[];
  languages: ILanguageItem[];
  sections: IParsedSection[];
  metadata: IParsedResumeMetadata;
  warnings: IParseWarning[];
  parsingMetrics: IParsingMetrics;
  parseConfidence: number;
  resumeType: ResumeType;
}

export interface IParsedResumeMetadata {
  pageCount: number;
  hasMultipleColumns: boolean;
  hasTables: boolean;
  fonts: IFont[];
  colors: string[];
  layoutNotes: string[];
}

export interface IContactInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  otherLinks: string[];
}

export interface IParsedSection {
  id: string;
  title: string;
  type: ParsedSectionType;
  rawText: string;
  normalizedText: string;
  startLine: number;
  endLine: number;
  confidence: number;
}

export interface IExperienceItem {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  bullets: string[];
  summary?: string;
}

export interface IEducationItem {
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
}

export interface IProjectItem {
  name?: string;
  description?: string;
  technologies: string[];
}

export interface ICertificationItem {
  name?: string;
  authority?: string;
  date?: string;
}

export interface ILanguageItem {
  name: string;
  proficiency?: string;
}

export interface IParsingMetrics {
  parseTimeMs: number;
  sectionCount: number;
  skillCount: number;
  experienceCount: number;
  educationCount: number;
  projectCount: number;
  certificationCount: number;
  languageCount: number;
  warningCount: number;
  rawTextLength: number;
}

export interface IParseWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ISection {
  name: string;
  type: 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'other';
  content: string;
  startLine: number;
  endLine: number;
}

export interface IFont {
  name: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

// ============================================
// Job Description Types
// ============================================

export interface IJobDescription {
  id: string;
  userId: string;
  jobTitle: string;
  companyName?: string;
  rawText: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  certifications: string[];
  domainKnowledge: string[];
  softSkills: string[];
  seniorityLevel?: 'entry' | 'mid' | 'senior' | 'executive';
  industry?: string;
  createdAt: Date;
}

// ============================================
// Optimization Types
// ============================================

export interface IOptimizationRequest {
  resumeId: string;
  jobDescriptionId: string;
  strategyType: 'conservative' | 'ats_focused' | 'recruiter_focused';
}

export interface IOptimizationResult {
  versionId: string;
  originalText: string;
  optimizedText: string;
  changes: IChange[];
  scores: IScores;
  metadata: IOptimizationMetadata;
}

export interface IChange {
  section: string;
  original: string;
  optimized: string;
  reason: string;
  confidence: number; // 0-1
}

export interface IScores {
  matchScore: number;      // 0-100: How well matches JD
  atsScore: number;        // 0-100: ATS compatibility
  recruiterScore: number;  // 0-100: Recruiter appeal
  overallScore: number;    // Weighted combination
}

export interface IOptimizationMetadata {
  keywordsCovered: number;
  keywordsTotal: number;
  skillsMatched: number;
  skillsTotal: number;
  readabilityScore: number;
  estimatedTimeToRead: number; // seconds
}

// ============================================
// API Response Types
// ============================================

export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface IPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// Error Types
// ============================================

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ============================================
// User Types
// ============================================

export interface IUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface IAuthPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// ============================================
// Validation Types
// ============================================

export interface IValidationResult {
  isValid: boolean;
  errors: IValidationError[];
  warnings: IValidationWarning[];
}

export interface IValidationError {
  type: 'hallucination' | 'format' | 'length' | 'duplicate' | 'ats_breaking';
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface IValidationWarning {
  type: string;
  message: string;
}
