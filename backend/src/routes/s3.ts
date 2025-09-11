import { Router, Request, Response } from 'express';
import { S3IntegrationService } from '../s3/S3IntegrationService';
import { AuthenticationService } from '../auth/AuthenticationService';
import { ALBLogIngestion } from '../ingestion/LogIngestion';
import { ProcessingOptions, ProcessingProgress, ProcessingResult } from '../ingestion/types';
import { S3SearchCriteria } from '../s3/types';
import { createDataStore } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';

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
  
  console.log('S3 route - Session token received:', sessionToken ? sessionToken.substring(0, 16) + '...' : 'none');
  
  // If no session token provided, try to use default environment credentials
  if (!sessionToken) {
    const defaultToken = authService.getDefaultSessionToken();
    if (defaultToken) {
      console.log('S3 route - Using default environment credentials');
      const credentials = await authService.getCredentials(defaultToken);
      return credentials;
    }
    throw new Error('No session token provided and no environment credentials available');
  }

  console.log('S3 route - Active sessions count:', authService.getActiveSessionCount());
  
  try {
    const credentials = await authService.getCredentials(sessionToken);
    console.log('S3 route - Credentials found for session');
    return credentials;
  } catch (error) {
    console.log('S3 route - Failed to get credentials:', error instanceof Error ? error.message : error);
    
    // Fallback to default credentials if available
    const defaultToken = authService.getDefaultSessionToken();
    if (defaultToken) {
      console.log('S3 route - Falling back to default environment credentials');
      const credentials = await authService.getCredentials(defaultToken);
      return credentials;
    }
    
    throw error;
  }
};

/**
 * GET /api/s3/buckets
 * List all S3 buckets accessible with current credentials
 */
router.get('/buckets', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials = await getCredentialsFromSession(req);
    
    const s3Service = new S3IntegrationService();
    const buckets = await s3Service.listBuckets(credentials);

    res.json({
      buckets,
      count: buckets.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Error listing S3 buckets:', error);
    res.status(500).json({
      error: 'Failed to list buckets',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/s3/objects
 * List objects in a specific S3 bucket with optional prefix
 * Query parameters:
 * - bucket (required): S3 bucket name
 * - prefix (optional): Object key prefix to filter results
 */
router.get('/objects', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bucket, prefix = '' } = req.query;

    if (!bucket || typeof bucket !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });
      return;
    }

    const credentials = await getCredentialsFromSession(req);
    
    const s3Service = new S3IntegrationService();
    const objects = await s3Service.listObjects(bucket, prefix as string, credentials);

    res.json({
      bucket,
      prefix: prefix || '',
      objects,
      count: objects.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Error listing S3 objects:', error);
    res.status(500).json({
      error: 'Failed to list objects',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/s3/search
 * Search for log files in S3 bucket with advanced filtering
 * Request body should contain:
 * - bucket (required): S3 bucket name
 * - searchCriteria: S3SearchCriteria object with filtering options
 */
router.post('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bucket, searchCriteria } = req.body;

    if (!bucket || typeof bucket !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });
      return;
    }

    // Validate and set default search criteria
    const criteria: S3SearchCriteria = {
      prefix: searchCriteria?.prefix || '',
      fileExtensions: searchCriteria?.fileExtensions || [],
      dateRange: searchCriteria?.dateRange && (searchCriteria.dateRange.start || searchCriteria.dateRange.end) ? {
        start: searchCriteria.dateRange.start ? new Date(searchCriteria.dateRange.start) : new Date(0),
        end: searchCriteria.dateRange.end ? new Date(searchCriteria.dateRange.end) : new Date()
      } : undefined,
      maxSize: searchCriteria?.maxSize,
      recursive: searchCriteria?.recursive !== false // default to true
    };

    // Validate date range if provided
    if (searchCriteria?.dateRange) {
      if (searchCriteria.dateRange.start) {
        const startDate = new Date(searchCriteria.dateRange.start);
        if (isNaN(startDate.getTime())) {
          res.status(400).json({
            error: 'Invalid date format',
            message: 'dateRange.start must be a valid date'
          });
          return;
        }
      }
      if (searchCriteria.dateRange.end) {
        const endDate = new Date(searchCriteria.dateRange.end);
        if (isNaN(endDate.getTime())) {
          res.status(400).json({
            error: 'Invalid date format',
            message: 'dateRange.end must be a valid date'
          });
          return;
        }
      }
    }

    const credentials = await getCredentialsFromSession(req);
    
    const s3Service = new S3IntegrationService();
    const objects = await s3Service.searchLogFiles(bucket, criteria, credentials);

    res.json({
      bucket,
      searchCriteria: criteria,
      objects,
      count: objects.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Error searching S3 objects:', error);
    res.status(500).json({
      error: 'Failed to search objects',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/s3/ingest
 * Start ingestion of S3 objects
 * Request body should contain:
 * - bucket (required): S3 bucket name
 * - objects (required): Array of S3Object to ingest
 * - options (optional): Processing options
 */
router.post('/ingest', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Debug: Full request body received:', JSON.stringify(req.body, null, 2));
    const { bucket, objects, options = {} } = req.body;
    console.log(`Debug: Extracted bucket: "${bucket}", objects count: ${objects?.length || 'undefined'}`);

    if (!bucket || typeof bucket !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });
      return;
    }

    if (!objects || !Array.isArray(objects) || objects.length === 0) {
      res.status(400).json({
        error: 'Missing S3 objects',
        message: 'objects array is required and must contain at least one object'
      });
      return;
    }

    const credentials = await getCredentialsFromSession(req);

    // Transform objects to match the expected format for ingestion
    const s3Objects = objects.map((obj: any) => ({
      bucket,
      key: obj.key,
      size: obj.size,
      lastModified: obj.lastModified,
      storageClass: obj.storageClass
    }));

    console.log(`Debug: S3 ingestion starting with bucket: ${bucket}, objects count: ${s3Objects.length}`);
    console.log(`Debug: First object structure:`, s3Objects[0]);

    // Create ingestion instance
    const ingestion = new ALBLogIngestion();

    // Configure processing options
    const processingOptions: ProcessingOptions = {
      batchSize: options.batchSize || 1000,
      maxConcurrentFiles: options.maxConcurrentFiles || 1,
      skipMalformedLines: options.skipMalformedLines !== false,
      progressCallback: (progress: ProcessingProgress) => {
        // Progress updates could be sent via WebSocket in the future
        console.log(`Processing progress: ${progress.processedFiles}/${progress.totalFiles} files`);
      },
      errorCallback: (error) => {
        console.warn('Processing error:', error);
      }
    };

    // Start processing S3 files
    console.log(`Starting ingestion of ${s3Objects.length} files from bucket ${bucket}`);
    
    const result: ProcessingResult = await ingestion.loadS3Files(s3Objects, credentials, processingOptions);

    // Transform result to match expected frontend format
    // Note: The ProcessingResult from LogIngestion has different field names than IngestionResult
    const ingestionResult = {
      success: result.success,
      totalFiles: result.totalFiles,
      successfulFiles: result.processedFiles, // Map processedFiles to successfulFiles
      failedFiles: result.totalFiles - result.processedFiles,
      totalEntriesProcessed: result.successfullyParsed,
      processingResults: result.errors.map(error => ({
        filename: error.fileName,
        success: false,
        error: error.error
      })),
      summary: {
        totalFiles: result.totalFiles,
        successfulFiles: result.processedFiles,
        failedFiles: result.totalFiles - result.processedFiles,
        totalEntriesProcessed: result.successfullyParsed
      }
    };

    res.json(ingestionResult);

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Error starting S3 ingestion:', error);
    res.status(500).json({
      error: 'Failed to start S3 ingestion',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/s3/folder-contents
 * Get all files in a folder recursively
 * Query parameters:
 * - bucket (required): S3 bucket name
 * - prefix (required): Folder prefix to fetch all files from
 * - fileExtensions (optional): Comma-separated list of file extensions to filter
 */
router.get('/folder-contents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bucket, prefix = '', fileExtensions } = req.query;

    if (!bucket || typeof bucket !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });
      return;
    }

    const credentials = await getCredentialsFromSession(req);
    
    const s3Service = new S3IntegrationService();
    
    // Build search criteria for recursive search
    const searchCriteria: S3SearchCriteria = {
      prefix: prefix as string,
      recursive: true,
      fileExtensions: fileExtensions 
        ? (fileExtensions as string).split(',').map(ext => ext.trim())
        : ['.log', '.gz', '.txt', '.gzip'] // Default to common log file extensions
    };
    
    // Use the existing searchLogFiles method to get all files recursively
    const objects = await s3Service.searchLogFiles(bucket, searchCriteria, credentials);
    
    // Filter out folders (keys ending with /)
    const files = objects.filter(obj => !obj.key.endsWith('/'));

    res.json({
      bucket,
      prefix: prefix || '',
      files,
      count: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Error fetching folder contents:', error);
    res.status(500).json({
      error: 'Failed to fetch folder contents',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// New endpoint for proper folder/directory browsing  
router.get('/folders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bucket, prefix = '' } = req.query;

    if (!bucket || typeof bucket !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });
      return;
    }

    const credentials = await getCredentialsFromSession(req);
    const s3Service = new S3IntegrationService();
    
    // Get folder structure (directories/prefixes) instead of files
    const folders = await s3Service.listFolders(bucket, prefix as string, credentials);
    
    res.json({
      bucket,
      prefix: prefix || '',
      folders,
      count: folders.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired') || error.message.includes('No session token'))) {
      res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
      return;
    }

    console.error('Error fetching folders:', error);
    res.status(500).json({
      error: 'Failed to fetch folders',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/s3/check-downloaded
 * Check if files from specific S3 prefixes have been downloaded
 * Query parameters:
 * - prefixes: Comma-separated list of S3 prefixes to check
 * - bucket: S3 bucket name
 */
router.get('/check-downloaded', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prefixes, bucket } = req.query;
    
    if (!prefixes || typeof prefixes !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'prefixes parameter is required'
      });
      return;
    }

    if (!bucket || typeof bucket !== 'string') {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });
      return;
    }

    const prefixList = prefixes.split(',').map(p => p.trim());
    
    // Get database connection
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const dataStore = await createDataStore(connectionPool);
    
    // Check each prefix for downloaded files
    const results: Record<string, { downloaded: boolean; fileCount: number; lastDownloaded?: Date }> = {};
    
    for (const prefix of prefixList) {
      // Query database for files with this S3 key prefix
      // Just pass the prefix - the DataStore will handle the S3 path parsing
      const count = await dataStore.getFileCountByPrefix(prefix);
      
      if (count > 0) {
        // Get the most recent download timestamp
        const lastDownload = await dataStore.getLastDownloadTime(prefix);
        results[prefix] = {
          downloaded: true,
          fileCount: count,
          lastDownloaded: lastDownload || undefined
        };
      } else {
        results[prefix] = {
          downloaded: false,
          fileCount: 0
        };
      }
    }
    
    res.json({
      bucket,
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error checking download status:', error);
    res.status(500).json({
      error: 'Failed to check download status',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/s3/status
 * Get S3 service status (for monitoring)
 */
router.get('/status', (req: Request, res: Response) => {
  res.json({
    service: 'S3 Integration Service',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

export default router;