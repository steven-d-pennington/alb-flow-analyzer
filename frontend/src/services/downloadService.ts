import { DownloadBatch, DownloadEstimate, DownloadRequest, DownloadProgress, BatchSummary } from '../types/index';
import { api } from './authService';

export class DownloadService {
  /**
   * Get download size estimate
   */
  async estimateDownload(s3FilePaths: string[]): Promise<DownloadEstimate> {
    try {
      const response = await api.post('/api/downloads/estimate', { s3FilePaths });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to estimate download');
    }
  }

  /**
   * Start downloading files
   */
  async startDownload(request: DownloadRequest): Promise<string> {
    try {
      const response = await api.post('/api/downloads/start', request);
      return response.data.data.batchId;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to start download');
    }
  }

  /**
   * Get all download batches
   */
  async getBatches(status?: string): Promise<BatchSummary[]> {
    try {
      const params = status ? { status } : {};
      const response = await api.get('/api/downloads/batches', { params });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to get batches');
    }
  }

  /**
   * Get specific batch details
   */
  async getBatch(batchId: string): Promise<{
    batch: DownloadBatch;
    files: any[];
    filesExist: boolean;
  }> {
    try {
      const response = await api.get(`/api/downloads/batches/${batchId}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to get batch details');
    }
  }

  /**
   * Get download progress for specific batch
   */
  async getDownloadProgress(batchId: string): Promise<DownloadProgress> {
    try {
      const response = await api.get(`/api/downloads/batches/${batchId}/progress`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to get download progress');
    }
  }

  /**
   * Cancel active download
   */
  async cancelDownload(batchId: string): Promise<void> {
    try {
      await api.post(`/api/downloads/batches/${batchId}/cancel`);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to cancel download');
    }
  }

  /**
   * Delete batch and its files
   */
  async deleteBatch(batchId: string, deleteFiles: boolean = true): Promise<void> {
    try {
      await api.delete(`/api/downloads/batches/${batchId}`, {
        params: { deleteFiles: deleteFiles.toString() }
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to delete batch');
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalBatches: number;
    totalFiles: number;
    totalSizeBytes: number;
    statusBreakdown: Record<string, number>;
    activeDownloads: number;
    activeDownloadIds: string[];
  }> {
    try {
      const response = await api.get('/api/downloads/stats');
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to get statistics');
    }
  }

  /**
   * Cleanup old batches
   */
  async cleanupOldBatches(olderThanDays: number = 7): Promise<{
    deletedBatches: number;
    olderThanDays: number;
  }> {
    try {
      const response = await api.post('/api/downloads/cleanup', { olderThanDays });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message || 'Failed to cleanup batches');
    }
  }
}

// Create singleton instance
export const downloadService = new DownloadService();