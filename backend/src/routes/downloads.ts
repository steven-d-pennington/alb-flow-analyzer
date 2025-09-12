import { Router, Request, Response } from 'express';
import { DownloadService, LocalFileManager } from '../downloads';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { AuthenticationService } from '../auth/AuthenticationService';
// import { ALBWebSocketServer } from '../websocket/WebSocketServer';
import { S3 } from 'aws-sdk';
import { DownloadRequest, DownloadStatus } from '../downloads/types';

const router = Router();

// Middleware to extract session token from Authorization header
const extractSessionToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

// Middleware to get credentials from session token or environment
const getCredentialsFromSession = async (req: Request): Promise<any> => {
  // Get the AuthenticationService instance
  const authService = AuthenticationService.getInstance();
  
  // First check for session token from request
  const sessionToken = extractSessionToken(req);
  
  console.log('Downloads route - Session token received:', sessionToken ? sessionToken.substring(0, 16) + '...' : 'none');
  
  // If no session token provided, try to use default environment credentials
  if (!sessionToken) {
    const defaultToken = authService.getDefaultSessionToken();
    if (defaultToken) {
      console.log('Downloads route - Using default environment credentials');
      const credentials = await authService.getCredentials(defaultToken);
      return credentials;
    }
    throw new Error('No session token provided and no environment credentials available');
  }

  try {
    const credentials = await authService.getCredentials(sessionToken);
    console.log('Downloads route - Credentials found for session');
    return credentials;
  } catch (error) {
    console.log('Downloads route - Failed to get credentials:', error instanceof Error ? error.message : error);
    
    // Fallback to default credentials if available
    const defaultToken = authService.getDefaultSessionToken();
    if (defaultToken) {
      console.log('Downloads route - Falling back to default environment credentials');
      const credentials = await authService.getCredentials(defaultToken);
      return credentials;
    }
    
    throw error;
  }
};

// Initialize services
let downloadService: DownloadService | null = null;
let localFileManager: LocalFileManager | null = null;
let webSocketServer: any = null;

// Export function to set WebSocket server
export const setWebSocketServer = (ws: any) => {
  webSocketServer = ws;
  // Reinitialize download service with WebSocket server
  if (downloadService) {
    initializeServices();
  }
};

const initializeServices = async (credentials?: any) => {
  if (!localFileManager) {
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    
    localFileManager = new LocalFileManager(connectionPool);
  }
  
  // Always create a new DownloadService with the provided credentials
  // This ensures we use the correct credentials for each request
  let s3: S3;
  if (credentials) {
    console.log('Downloads route - Creating S3 client with provided credentials');
    s3 = new S3({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      region: credentials.region || process.env.AWS_REGION || 'us-east-1'
    });
  } else {
    console.log('Downloads route - Creating S3 client with environment credentials');
    s3 = new S3({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  
  const currentDownloadService = new DownloadService(
    s3,
    localFileManager,
    webSocketServer,
    {
      tempDirectory: process.env.TEMP_DOWNLOAD_DIR || './temp/downloads',
      maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '10'),
      retryAttempts: parseInt(process.env.DOWNLOAD_RETRY_ATTEMPTS || '3')
    }
  );
  
  return { downloadService: currentDownloadService, localFileManager: localFileManager! };
};

/**
 * POST /api/downloads/estimate
 * Get download size estimate
 */
router.post('/estimate', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    const { downloadService } = await initializeServices(credentials);
    const { s3FilePaths } = req.body as { s3FilePaths: string[] };

    if (!Array.isArray(s3FilePaths) || s3FilePaths.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'S3 file paths array is required'
      });
      return;
    }

    const estimate = await downloadService.estimateDownload(s3FilePaths);

    res.json({
      success: true,
      data: estimate,
      meta: {
        requestedFiles: s3FilePaths.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Download estimate error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to estimate download',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/downloads/start
 * Start downloading files
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    const { downloadService } = await initializeServices(credentials);
    const downloadRequest = req.body as DownloadRequest;

    if (!Array.isArray(downloadRequest.s3FilePaths) || downloadRequest.s3FilePaths.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'S3 file paths array is required'
      });
      return;
    }

    const batchId = await downloadService.startDownload(downloadRequest);

    res.json({
      success: true,
      data: {
        batchId,
        message: 'Download started successfully'
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Download start error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start download',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/downloads/batches
 * Get all download batches
 */
router.get('/batches', async (req: Request, res: Response): Promise<void> => {
  try {
    const { localFileManager } = await initializeServices();
    const status = req.query.status as DownloadStatus | undefined;

    const batches = await localFileManager.getAllBatches(status);

    res.json({
      success: true,
      data: batches,
      meta: {
        totalBatches: batches.length,
        filteredBy: status ? { status } : null
      }
    });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get download batches',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/downloads/batches/:batchId
 * Get specific batch details
 */
router.get('/batches/:batchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { localFileManager } = await initializeServices();
    const { batchId } = req.params;

    const batch = await localFileManager.getBatch(batchId);
    if (!batch) {
      res.status(404).json({
        error: 'Not found',
        message: 'Download batch not found'
      });
      return;
    }

    const files = await localFileManager.getBatchFiles(batchId);
    const filesExist = await localFileManager.verifyBatchFiles(batchId);

    res.json({
      success: true,
      data: {
        batch,
        files,
        filesExist
      }
    });
  } catch (error) {
    console.error('Get batch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get batch details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/downloads/batches/:batchId/progress
 * Get download progress for specific batch
 */
router.get('/batches/:batchId/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    const { downloadService } = await initializeServices(credentials);
    const { batchId } = req.params;

    const progress = await downloadService.getDownloadProgress(batchId);
    if (!progress) {
      res.status(404).json({
        error: 'Not found',
        message: 'Download batch not found'
      });
      return;
    }

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Get progress error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get download progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/downloads/batches/:batchId/cancel
 * Cancel active download
 */
router.post('/batches/:batchId/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    const { downloadService } = await initializeServices(credentials);
    const { batchId } = req.params;

    if (!downloadService.isDownloadActive(batchId)) {
      res.status(400).json({
        error: 'Invalid operation',
        message: 'Download is not active or does not exist'
      });
      return;
    }

    await downloadService.cancelDownload(batchId);

    res.json({
      success: true,
      message: 'Download cancelled successfully'
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Cancel download error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cancel download',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/downloads/batches/:batchId
 * Delete batch and its files
 */
router.delete('/batches/:batchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    const { localFileManager, downloadService } = await initializeServices(credentials);
    const { batchId } = req.params;
    const { deleteFiles = true } = req.query;

    // Cancel if active
    if (downloadService.isDownloadActive(batchId)) {
      await downloadService.cancelDownload(batchId);
    }

    await localFileManager.deleteBatch(batchId, deleteFiles === 'true');

    res.json({
      success: true,
      message: 'Batch deleted successfully'
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Delete batch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete batch',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/downloads/stats
 * Get storage statistics
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    const { localFileManager, downloadService } = await initializeServices(credentials);

    const storageStats = await localFileManager.getStorageStats();
    const activeDownloads = downloadService.getActiveDownloads();

    res.json({
      success: true,
      data: {
        ...storageStats,
        activeDownloads: activeDownloads.length,
        activeDownloadIds: activeDownloads
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/downloads/cleanup
 * Cleanup old batches
 */
router.post('/cleanup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { localFileManager } = await initializeServices();
    const { olderThanDays = 7 } = req.body;

    const deletedCount = await localFileManager.cleanupOldBatches(olderThanDays);

    res.json({
      success: true,
      data: {
        deletedBatches: deletedCount,
        olderThanDays
      },
      message: `Cleaned up ${deletedCount} old batches`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cleanup batches',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;