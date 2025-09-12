export interface DownloadBatch {
  batchId: string;
  batchName: string;
  downloadDate: Date;
  fileCount: number;
  totalSizeBytes: number;
  s3FilePaths: string[];
  localFilePaths: string[];
  status: DownloadStatus;
  errorMessage?: string;
  downloadStartedAt?: Date;
  downloadCompletedAt?: Date;
  estimatedSizeBytes: number;
  progressPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled';

export interface DownloadProgress {
  batchId: string;
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  progressPercentage: number;
  downloadSpeed?: number; // bytes per second
  estimatedTimeRemaining?: number; // seconds
  status: DownloadStatus;
  errorMessage?: string;
}

export interface DownloadRequest {
  s3FilePaths: string[];
  batchName?: string;
  estimateOnly?: boolean;
}

export interface DownloadEstimate {
  totalFiles: number;
  estimatedSizeBytes: number;
  estimatedDurationMinutes: number;
}

export interface S3FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export interface LocalFileInfo {
  localPath: string;
  s3Path: string;
  size: number;
  downloadedAt: Date;
  checksum?: string;
}

export interface BatchSummary {
  batchId: string;
  batchName: string;
  fileCount: number;
  totalSizeBytes: number;
  status: DownloadStatus;
  downloadDate: Date | null;
  processingStatus?: 'not_processed' | 'processing' | 'processed' | 'error';
}

export interface DownloadServiceConfig {
  tempDirectory: string;
  maxConcurrentDownloads: number;
  retryAttempts: number;
  retryDelayMs: number;
  resumeSupported: boolean;
  cleanupOnError: boolean;
}

export interface FileProgress {
  filePath: string;
  downloadedBytes: number;
  totalBytes: number;
  isComplete: boolean;
  error?: string;
}