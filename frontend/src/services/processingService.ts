const API_BASE_URL = 'http://localhost:3001/api';

export interface ProcessingOptions {
  batchId: string;
  deleteAfterProcessing?: boolean;
  forceReprocess?: boolean;
}

export interface ProcessingResult {
  batchId: string;
  filesProcessed: number;
  recordsProcessed: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface ProcessingStatus {
  batchId: string;
  status: string;
  isProcessing: boolean;
  canProcess: boolean;
}

export class ProcessingService {
  /**
   * Process a downloaded batch
   */
  async processBatch(options: ProcessingOptions): Promise<ProcessingResult> {
    const response = await fetch(`${API_BASE_URL}/processing/batch/${options.batchId}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deleteAfterProcessing: options.deleteAfterProcessing || false,
        forceReprocess: options.forceReprocess || false
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to process batch');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get processing status for a batch
   */
  async getProcessingStatus(batchId: string): Promise<ProcessingStatus> {
    const response = await fetch(`${API_BASE_URL}/processing/batch/${batchId}/status`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to get processing status');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Process all pending batches
   */
  async processAllPending(): Promise<{ batchesProcessed: number; results: ProcessingResult[] }> {
    const response = await fetch(`${API_BASE_URL}/processing/process-all-pending`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to process pending batches');
    }

    const result = await response.json();
    return result.data;
  }
}

// Create singleton instance
export const processingService = new ProcessingService();