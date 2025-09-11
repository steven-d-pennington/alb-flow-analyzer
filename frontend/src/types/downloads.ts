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
  downloadSpeed?: number;
  estimatedTimeRemaining?: number;
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

export interface BatchSummary {
  batchId: string;
  batchName: string;
  fileCount: number;
  totalSizeBytes: number;
  status: DownloadStatus;
  downloadDate: Date | null;
  processingStatus?: 'not_processed' | 'processing' | 'processed' | 'error';
}