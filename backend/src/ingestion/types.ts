// Types for log ingestion pipeline

import { ParsedLogEntry } from '../parser/types';

export interface ProcessingProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  totalBytes: number;
  processedBytes: number;
  totalLines: number;
  processedLines: number;
  successfullyParsed: number;
  failedLines: number;
  estimatedTimeRemaining: number;
  errors: ProcessingError[];
  startTime: Date;
  isComplete: boolean;
}

export interface ProcessingError {
  fileName: string;
  lineNumber?: number;
  error: string;
  timestamp: Date;
  severity: 'warning' | 'error' | 'critical';
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  isCompressed: boolean;
  encoding?: string;
}

export interface ProcessingOptions {
  batchSize?: number;
  maxConcurrentFiles?: number;
  skipMalformedLines?: boolean;
  progressCallback?: (progress: ProcessingProgress) => void;
  errorCallback?: (error: ProcessingError) => void;
}

export interface ProcessingResult {
  success: boolean;
  totalFiles: number;
  processedFiles: number;
  totalLines: number;
  successfullyParsed: number;
  failedLines: number;
  entries: ParsedLogEntry[];
  errors: ProcessingError[];
  processingTime: number;
}

export interface LogIngestion {
  loadLocalFiles(filePaths: string[], options?: ProcessingOptions): Promise<ProcessingResult>;
  validateLogFormat(filePath: string): Promise<boolean>;
  handleMalformedEntries(entry: string, error: Error, fileName: string, lineNumber: number): void;
  getProcessingProgress(): ProcessingProgress;
  cancelProcessing(): void;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  storageClass: string;
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

// Extended interface for S3 support (will be implemented in future tasks)
export interface S3LogIngestion extends LogIngestion {
  loadS3Files(s3Objects: S3Object[], credentials: AWSCredentials, options?: ProcessingOptions): Promise<ProcessingResult>;
}