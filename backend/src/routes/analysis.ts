import { Router, Request, Response } from 'express';
import { AnalysisEngine } from '../analysis/AnalysisEngine';
import { createDataStore, FilterCriteria } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { 
  paginationMiddleware, 
  validatePagination, 
  parsePaginationParams,
  createPaginatedResponse,
  paginationToFilterCriteria,
  PaginationParams,
  DEFAULT_PAGINATION_CONFIG
} from '../utils/pagination';

const router = Router();

// Initialize database connection and analysis engine
let analysisEngine: AnalysisEngine | null = null;

const initializeAnalysisEngine = async () => {
  if (!analysisEngine) {
    try {
      console.log('Initializing analysis engine...');
      console.log('Current working directory:', process.cwd());
      const config = getDatabaseConfig();
      console.log('Database config:', config);
      
      const factory = ConnectionFactory.getInstance();
      console.log('Creating connection pool...');
      const connectionPool = await factory.createPool(config);
      console.log('Creating data store...');
      const dataStore = await createDataStore(connectionPool);
      console.log('Creating analysis engine...');
      analysisEngine = new AnalysisEngine(dataStore);
      console.log('Analysis engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize analysis engine:', error);
      throw error;
    }
  }
  return analysisEngine;
};



/**
 * GET /api/analysis/results
 * Get analysis results for all data
 * Now supports pagination for large datasets
 */
router.get('/results', 
  validatePagination({ maxLimit: 5000, defaultLimit: 100 }),
  paginationMiddleware({ maxLimit: 5000, defaultLimit: 100 }),
  async (req: Request & { pagination?: PaginationParams }, res: Response): Promise<void> => {
    try {
      console.log('Analysis route - Initializing analysis engine...');
      const engine = await initializeAnalysisEngine();
      console.log('Analysis route - Engine initialized, checking data...');
      
      // Get pagination parameters
      const paginationParams = req.pagination || parsePaginationParams(req.query, { maxLimit: 5000, defaultLimit: 100 });
      
      // Check if there's any data in the database
      const totalCount = await engine.getDataStore().count();
      console.log('Analysis route - Total entries in database:', totalCount);
      
      if (totalCount === 0) {
        res.json(createPaginatedResponse([], paginationParams, 0, 0));
        return;
      }
      
      console.log('Analysis route - Analyzing traffic patterns with pagination...', paginationParams);
      const startTime = Date.now();
      
      // For large datasets, we need to provide paginated analysis results
      // This involves getting raw data paginated and then analyzing it
      const filterCriteria = paginationToFilterCriteria(paginationParams);
      const paginatedData = await engine.getDataStore().queryPaginated(undefined, paginationParams.page, paginationParams.limit);
      
      // Run analysis on the paginated subset
      const analysisResult = await engine.analyzeTrafficPatterns(filterCriteria);
      const processingTime = Date.now() - startTime;
      
      // Create paginated response with analysis metadata
      const response = createPaginatedResponse(
        [analysisResult], // Analysis result as single item array
        paginationParams,
        1, // Total analysis results count (always 1 for summary)
        processingTime
      );
      
      // Add raw data pagination info to metadata
      response.meta = {
        ...response.meta,
        rawDataPagination: {
          totalRawRecords: totalCount,
          analyzedRecords: paginatedData.data.length,
          rawDataPage: paginatedData.currentPage,
          rawDataTotalPages: paginatedData.totalPages
        }
      };
      
      console.log('Analysis route - Analysis complete, sending paginated results');
      res.json(response);
    } catch (error) {
      console.error('Error getting analysis results:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get analysis results',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/analysis/raw-data
 * Get raw log data with pagination support
 * This endpoint is optimized for large datasets
 */
router.get('/raw-data',
  validatePagination({ maxLimit: 10000, defaultLimit: 1000 }),
  paginationMiddleware({ maxLimit: 10000, defaultLimit: 1000 }),
  async (req: Request & { pagination?: PaginationParams }, res: Response): Promise<void> => {
    try {
      const engine = await initializeAnalysisEngine();
      const paginationParams = req.pagination || parsePaginationParams(req.query, { maxLimit: 10000, defaultLimit: 1000 });
      
      const startTime = Date.now();
      
      // Parse additional filter parameters from query string
      const filters: FilterCriteria = {};
      
      if (req.query.startTime && req.query.endTime) {
        filters.timeRange = {
          start: new Date(req.query.startTime as string),
          end: new Date(req.query.endTime as string)
        };
      }
      
      if (req.query.clientIps) {
        const clientIps = Array.isArray(req.query.clientIps) 
          ? req.query.clientIps as string[]
          : [req.query.clientIps as string];
        filters.clientIps = clientIps;
      }
      
      if (req.query.statusCodes) {
        const statusCodes = Array.isArray(req.query.statusCodes)
          ? req.query.statusCodes.map(code => parseInt(code as string, 10))
          : [parseInt(req.query.statusCodes as string, 10)];
        filters.statusCodes = statusCodes.filter(code => !isNaN(code));
      }
      
      // Apply pagination to filters
      const paginatedFilters = {
        ...filters,
        ...paginationToFilterCriteria(paginationParams)
      };
      
      // Get paginated raw data
      const paginatedResult = await engine.getDataStore().queryPaginated(
        paginatedFilters, 
        paginationParams.page, 
        paginationParams.limit
      );
      
      const processingTime = Date.now() - startTime;
      
      const response = createPaginatedResponse(
        paginatedResult.data,
        paginationParams,
        paginatedResult.totalCount,
        processingTime
      );
      
      res.json(response);
    } catch (error) {
      console.error('Error getting raw data:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get raw data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/analysis/filter
 * Apply filters and get filtered analysis results
 * Now supports pagination for large filtered datasets
 */
router.post('/filter',
  validatePagination({ maxLimit: 5000, defaultLimit: 100 }),
  async (req: Request, res: Response) => {
  try {
    const filters = req.body;
    const paginationParams = parsePaginationParams(req.query, { maxLimit: 5000, defaultLimit: 100 });
    console.log('Applying filters with pagination:', filters, paginationParams);
    
    // Validate filter criteria
    if (filters.timeRange) {
      const { start, end } = filters.timeRange;
      if (!start || !end) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Time range filter requires both start and end dates'
        });
        return;
      }
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Invalid date format in time range filter'
        });
        return;
      }
      
      if (startDate >= endDate) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Start date must be before end date'
        });
        return;
      }
    }
    
    if (filters.statusCodes && filters.statusCodes.some((code: number) => code < 100 || code > 599)) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Status codes must be between 100 and 599'
      });
      return;
    }
    
    if (filters.endpoints && filters.endpoints.some((endpoint: string) => !endpoint.startsWith('/'))) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Endpoints must start with /'
      });
      return;
    }

    // Convert filter format to match DataStore FilterCriteria
    const filterCriteria: FilterCriteria = {};
    
    if (filters.timeRange) {
      filterCriteria.timeRange = {
        start: new Date(filters.timeRange.start),
        end: new Date(filters.timeRange.end)
      };
    }
    
    if (filters.endpoints && filters.endpoints.length > 0) {
      filterCriteria.endpoints = filters.endpoints;
    }
    
    if (filters.statusCodes && filters.statusCodes.length > 0) {
      filterCriteria.statusCodes = filters.statusCodes;
    }
    
    if (filters.clientIps && filters.clientIps.length > 0) {
      filterCriteria.clientIps = filters.clientIps;
    }
    
    if (filters.userAgentPatterns && filters.userAgentPatterns.length > 0) {
      filterCriteria.userAgentPatterns = filters.userAgentPatterns;
    }

    // Apply filters using the analysis engine with pagination
    const engine = await initializeAnalysisEngine();
    const startTime = Date.now();
    
    // Add pagination parameters to filter criteria
    const paginatedFilterCriteria = {
      ...filterCriteria,
      ...paginationToFilterCriteria(paginationParams)
    };
    
    const analysisResult = await engine.analyzeTrafficPatterns(paginatedFilterCriteria);
    const processingTime = Date.now() - startTime;
    
    // Get total count for pagination metadata
    const totalCount = await engine.getDataStore().count(filterCriteria);
    
    const response = createPaginatedResponse(
      [analysisResult], // Analysis result as single item
      paginationParams,
      Math.ceil(totalCount / paginationParams.limit), // Estimate analysis pages based on data pages
      processingTime
    );
    
    res.json(response);
  } catch (error) {
    console.error('Error applying filters:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to apply filters'
    });
  }
});

/**
 * GET /api/analysis/debug
 * Debug endpoint to check paths and configuration
 */
router.get('/debug', (req: Request, res: Response) => {
  const config = getDatabaseConfig();
  res.json({
    service: 'Analysis Service Debug',
    currentWorkingDirectory: process.cwd(),
    databaseConfig: config,
    resolvedDatabasePath: require('path').resolve(config.database),
    nodeEnv: process.env.NODE_ENV,
    databasePathEnv: process.env.DATABASE_PATH,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/analysis/status
 * Get analysis service status and database info
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const engine = await initializeAnalysisEngine();
    const totalCount = await engine.getDataStore().count();
    
    res.json({
      service: 'Analysis Service',
      status: 'operational',
      database: {
        connected: true,
        totalEntries: totalCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting analysis status:', error);
    res.status(500).json({
      service: 'Analysis Service',
      status: 'error',
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/files/progress
 * Get file processing progress (mock endpoint)
 */
router.get('/progress', (req: Request, res: Response) => {
  res.json({
    isProcessing: false,
    progress: 100,
    currentFile: null
  });
});

export default router;