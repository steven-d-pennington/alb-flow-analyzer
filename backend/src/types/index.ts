// Core type definitions for ALB Flow Analyzer
// These will be expanded in subsequent tasks

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface ProcessingProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  totalBytes: number;
  processedBytes: number;
  estimatedTimeRemaining: number;
  errors: ProcessingError[];
}

export interface ProcessingError {
  file: string;
  line?: number;
  message: string;
  timestamp: Date;
}

// Placeholder interfaces - will be implemented in subsequent tasks
export interface ParsedLogEntry {
  // Will be defined when implementing log parsing
}

export interface AnalysisResult {
  // Will be defined when implementing analysis engine
}

export interface FilterCriteria {
  // Will be defined when implementing filtering
}