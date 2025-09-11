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

// Import ParsedLogEntry from parser module
export { ParsedLogEntry } from '../parser/types';

// Import S3 types
export { 
  S3Object, 
  S3Bucket, 
  S3SearchCriteria, 
  S3ObjectMetadata, 
  S3IntegrationService 
} from '../s3/types';

export interface AnalysisResult {
  // Will be defined when implementing analysis engine
}

export interface FilterCriteria {
  // Will be defined when implementing filtering
}