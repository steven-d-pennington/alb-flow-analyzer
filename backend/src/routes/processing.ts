import { Router, Request, Response } from 'express';
import { OptimizedBatchProcessor } from '../ingestion/OptimizedBatchProcessor';
import { DownloadService, LocalFileManager } from '../downloads';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { S3 } from 'aws-sdk';

const router = Router();

// Initialize services
let optimizedBatchProcessor: OptimizedBatchProcessor | null = null;
let webSocketServer: any = null;

// Export function to set WebSocket server
export const setWebSocketServer = (ws: any) => {
  webSocketServer = ws;
  // Reinitialize services with WebSocket server
  if (optimizedBatchProcessor) {
    initializeServices();
  }
};

const initializeServices = async () => {
  if (!optimizedBatchProcessor) {
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    
    const localFileManager = new LocalFileManager(connectionPool);
    const s3 = new S3({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const downloadService = new DownloadService(
      s3,
      localFileManager,
      webSocketServer,
      {
        tempDirectory: process.env.TEMP_DOWNLOAD_DIR || './temp/downloads',
        maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '5'),
        retryAttempts: parseInt(process.env.DOWNLOAD_RETRY_ATTEMPTS || '3')
      }
    );
    
    optimizedBatchProcessor = new OptimizedBatchProcessor(
      localFileManager,
      downloadService,
      connectionPool,
      webSocketServer
    );
  }
  
  return optimizedBatchProcessor!;
};

/**
 * POST /api/processing/batch/:batchId/process
 * Process a downloaded batch
 */
router.post('/batch/:batchId/process', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await initializeServices();
    const { batchId } = req.params;
    const { deleteAfterProcessing = false, forceReprocess = false } = req.body;

    const result = await service.processBatch({
      batchId,
      processImmediately: true,
      deleteAfterProcessing,
      forceReprocess
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      error: 'Processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/processing/batch/:batchId/status
 * Get processing status for a batch
 */
router.get('/batch/:batchId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await initializeServices();
    const { batchId } = req.params;

    const status = await service.getProcessingStatus(batchId);

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/processing/process-all-pending
 * Process all pending batches
 */
router.post('/process-all-pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await initializeServices();

    const results = await service.processAllPending();

    res.json({
      success: true,
      data: {
        batchesProcessed: results.length,
        results
      }
    });
  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({
      error: 'Failed to process batches',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;