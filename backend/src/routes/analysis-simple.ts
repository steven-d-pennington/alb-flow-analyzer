import { Router, Request, Response } from 'express';
import { AnalysisEngine } from '../analysis/AnalysisEngine';
import { createDataStore, FilterCriteria } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';

const router = Router();

// Initialize database connection and analysis engine
let analysisEngine: AnalysisEngine | null = null;

const initializeAnalysisEngine = async () => {
  if (!analysisEngine) {
    try {
      console.log('Initializing analysis engine...');
      const config = getDatabaseConfig();
      console.log('Database config:', config);
      
      const factory = ConnectionFactory.getInstance();
      const connectionPool = await factory.createPool(config);
      const dataStore = await createDataStore(connectionPool);
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
 * GET /api/analysis-simple/results
 * Get analysis results with simple pagination
 */
router.get('/results', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Simple analysis route - Initializing...');
    const engine = await initializeAnalysisEngine();
    
    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 100));
    
    console.log(`Simple analysis route - Page=${page}, Limit=${limit}`);
    
    // Check if there's any data in the database
    const totalCount = await engine.getDataStore().count();
    console.log('Simple analysis route - Total entries:', totalCount);
    
    if (totalCount === 0) {
      res.json({
        data: [],
        pagination: {
          page,
          limit,
          totalCount: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        meta: { message: 'No data available' }
      });
      return;
    }
    
    console.log('Simple analysis route - Getting paginated results...');
    const startTime = Date.now();
    
    // Use existing paginated query method
    const result = await engine.getDataStore().queryPaginated(undefined, page, limit);
    
    const processingTime = Date.now() - startTime;
    
    const response = {
      data: result.data,
      pagination: {
        page: result.currentPage,
        limit: limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        hasNext: result.currentPage < result.totalPages,
        hasPrev: result.currentPage > 1
      },
      meta: {
        processingTimeMs: processingTime,
        message: `Retrieved ${result.data.length} records`
      }
    };
    
    console.log(`Simple analysis route - Success: ${result.data.length} records in ${processingTime}ms`);
    res.json(response);
    
  } catch (error) {
    console.error('Error in simple analysis route:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get analysis results',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analysis-simple/summary
 * Get analysis summary (lightweight version)
 */
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Simple summary route - Initializing...');
    const engine = await initializeAnalysisEngine();
    
    const startTime = Date.now();
    
    // Get basic counts and statistics
    const totalCount = await engine.getDataStore().count();
    
    const response = {
      data: {
        totalRecords: totalCount,
        status: totalCount > 0 ? 'ready' : 'empty',
        lastUpdated: new Date().toISOString()
      },
      meta: {
        processingTimeMs: Date.now() - startTime,
        message: 'Summary generated successfully'
      }
    };
    
    console.log(`Simple summary route - Success: ${totalCount} total records`);
    res.json(response);
    
  } catch (error) {
    console.error('Error in simple summary route:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;