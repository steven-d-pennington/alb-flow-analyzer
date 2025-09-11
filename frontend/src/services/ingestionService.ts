import { api } from './authService';
import { S3Object } from '../types/s3';

export interface IngestionRequest {
  bucket: string;
  objects: S3Object[];
  options?: {
    batchSize?: number;
    skipMalformedLines?: boolean;
  };
}

export interface IngestionResult {
  success: boolean;
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalEntriesProcessed: number;
  processingResults: Array<{
    filename: string;
    success: boolean;
    totalEntries?: number;
    successfulEntries?: number;
    failedEntries?: number;
    processingTimeMs?: number;
    error?: string;
  }>;
  summary: {
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    totalEntriesProcessed: number;
  };
}

export interface IngestionProgress {
  isProcessing: boolean;
  progress: number;
  currentFile: string | null;
  totalFiles: number;
  processedFiles: number;
  elapsedTime: number;
}

export class IngestionService {
  /**
   * Start ingestion of S3 objects
   */
  static async ingestS3Objects(request: IngestionRequest): Promise<IngestionResult> {
    try {
      console.log('Starting S3 object ingestion:', request);
      
      const response = await api.post('/api/s3/ingest', request);
      
      return response.data;
    } catch (error) {
      console.error('Failed to ingest S3 objects:', error);
      throw new Error('Failed to start S3 object ingestion');
    }
  }

  /**
   * Get ingestion progress for a session
   */
  static async getIngestionProgress(sessionId?: string): Promise<IngestionProgress> {
    try {
      const url = sessionId ? `/api/files/progress/${sessionId}` : '/api/files/progress';
      const response = await api.get(url);
      
      return response.data;
    } catch (error) {
      console.error('Failed to get ingestion progress:', error);
      throw new Error('Failed to get ingestion progress');
    }
  }

  /**
   * Cancel ongoing ingestion
   */
  static async cancelIngestion(sessionId?: string): Promise<void> {
    try {
      const url = sessionId ? `/api/files/cancel/${sessionId}` : '/api/files/cancel';
      await api.post(url);
    } catch (error) {
      console.error('Failed to cancel ingestion:', error);
      throw new Error('Failed to cancel ingestion');
    }
  }
}