// Frontend type definitions for ALB Flow Analyzer
// These will be expanded in subsequent tasks

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  storageClass: string;
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

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Placeholder interfaces - will be implemented in subsequent tasks
export interface AnalysisResult {
  // Will be defined when implementing analysis features
}

export interface FilterCriteria {
  // Will be defined when implementing filtering features
}