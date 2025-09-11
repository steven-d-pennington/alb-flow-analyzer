/**
 * Cached analysis routes with comprehensive caching strategies
 */

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

// Cache imports
import {
  CacheManager,
  CacheNamespace,
  cacheMiddleware,
  smartCacheMiddleware,
  cacheInvalidationMiddleware,
  getCacheKey,
  CACHE_STRATEGIES
} from '../cache';

const router = Router();

// Cache manager instance (will be initialized)
let cacheManager: CacheManager | null = null;

// Initialize analysis engine and cache manager
let analysisEngine: AnalysisEngine | null = null;

const initializeServices = async () => {
  if (!analysisEngine) {
    try {
      console.log('Initializing cached analysis services...');
      
      // Initialize cache manager
      const cacheConfig = {
        type: (process.env.NODE_ENV === 'production' ? 'redis' : 'hybrid') as 'memory' | 'redis' | 'hybrid',
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          keyPrefix: 'alb:',
        },
        memory: {
          maxSize: process.env.NODE_ENV === 'production' ? 50000 : 10000,
          maxAge: 300,
          updateAgeOnGet: true,
        },
        defaultTTL: 300,
        enableCompression: true,
        compressionThreshold: 1024,
        enableMetrics: true
      };

      cacheManager = new CacheManager(cacheConfig);
      await cacheManager.initialize();
      
      // Initialize analysis engine
      const config = getDatabaseConfig();
      console.log('Database config:', config);
      
      const factory = ConnectionFactory.getInstance();
      console.log('Creating connection pool...');
      const connectionPool = await factory.createPool(config);
      console.log('Creating data store...');
      const dataStore = await createDataStore(connectionPool);
      console.log('Creating analysis engine...');
      analysisEngine = new AnalysisEngine(dataStore);
      console.log('Cached analysis services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize cached analysis services:', error);
      throw error;
    }
  }
  return { analysisEngine, cacheManager };
};

/**
 * GET /api/analysis/cached/results
 * Cached version of analysis results with smart caching strategies
 */
router.get('/results',
  validatePagination({ maxLimit: 5000, defaultLimit: 100 }),
  paginationMiddleware({ maxLimit: 5000, defaultLimit: 100 }),
  async (req: Request, res: Response, next) => {
    try {
      const { cacheManager: cm } = await initializeServices();
      if (!cm) return next();
      
      return smartCacheMiddleware(cm.getCache(), {
        namespace: CacheNamespace.ANALYSIS,
        keyGenerator: (req: Request) => {
          const pagination = parsePaginationParams(req.query, { maxLimit: 5000, defaultLimit: 100 });
          return getCacheKey('results', req.query, pagination, req.query.filters || {});
        },
        ttl: CACHE_STRATEGIES.ANALYSIS.ttl,
        compress: true,
        tags: ['analysis', 'results', 'summary'],
        condition: (req, res) => {
          // Cache successful responses for GET requests only
          return req.method === 'GET' && res.statusCode < 400;
        }
      })(req, res, next);
    } catch (error) {
      return next();
    }
  },
  async (req: Request & { pagination?: PaginationParams }, res: Response) => {
    try {
      console.log('Cached analysis route - Starting analysis...');
      const { analysisEngine: engine, cacheManager: cm } = await initializeServices();
      
      if (!engine || !cm) {
        return res.status(500).json({ error: 'Services not initialized' });
      }

      // Get pagination parameters
      const paginationParams = req.pagination || parsePaginationParams(req.query, { maxLimit: 5000, defaultLimit: 100 });
      
      // Check if there's any data in the database
      const totalCount = await engine.getDataStore().count();
      console.log('Cached analysis route - Total entries in database:', totalCount);
      
      if (totalCount === 0) {
        return res.json(createPaginatedResponse([], paginationParams, 0, 0));
      }
      
      console.log('Cached analysis route - Analyzing traffic patterns with pagination...', paginationParams);
      const startTime = Date.now();
      
      // Parse filters from query
      const filters: FilterCriteria = {};
      if (req.query.startDate && req.query.endDate) {
        filters.timeRange = {
          start: new Date(req.query.startDate as string),
          end: new Date(req.query.endDate as string)
        };
      }
      if (req.query.statusCodes) {
        const codes = Array.isArray(req.query.statusCodes) 
          ? req.query.statusCodes 
          : [req.query.statusCodes];
        filters.statusCodes = codes.map(Number);
      }

      // For large datasets, we need to provide paginated analysis results
      const filterCriteria = { ...filters, ...paginationToFilterCriteria(paginationParams) };
      const paginatedData = await engine.getDataStore().queryPaginated(filters, paginationParams.page, paginationParams.limit);
      
      // Run analysis on the paginated subset
      const analysisResult = await engine.analyzeTrafficPatterns(filterCriteria);
      const processingTime = Date.now() - startTime;
      
      // Add cache headers for debugging
      res.set('X-Processing-Time', processingTime.toString());
      res.set('X-Total-Records', totalCount.toString());
      res.set('X-Analyzed-Records', paginatedData.data.length.toString());
      
      // Create paginated response with analysis metadata
      const response = createPaginatedResponse(
        [analysisResult], 
        paginationParams,
        1, 
        processingTime
      );
      
      // Add raw data pagination info to metadata
      response.meta = {
        ...response.meta as any,
        rawDataPagination: {
          totalRawRecords: totalCount,
          analyzedRecords: paginatedData.data.length,
          rawDataPage: paginatedData.currentPage,
          rawDataTotalPages: paginatedData.totalPages
        }
      };
      
      // Record performance metrics
      cm.getMonitoring().recordPerformance({
        operationId: `analysis-${Date.now()}`,
        operation: 'get',
        namespace: 'analysis',
        key: 'results',
        duration: processingTime,
        success: true,
        size: JSON.stringify(response).length
      });

      res.json(response);
      
    } catch (error) {
      console.error('Cached analysis route - Error:', error);
      const { cacheManager: cm } = await initializeServices();
      if (cm) {
        cm.getMonitoring().recordPerformance({
          operationId: `analysis-error-${Date.now()}`,
          operation: 'get',
          namespace: 'analysis',
          key: 'results',
          duration: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      res.status(500).json({
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/analysis/cached/summary
 * High-level summary with aggressive caching
 */
router.get('/summary',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    return cacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.ANALYSIS,
      keyGenerator: () => getCacheKey('summary', req.query),
      ttl: CACHE_STRATEGIES.AGGREGATED.ttl, // 30 minutes
      compress: true,
      tags: ['analysis', 'summary', 'dashboard'],
      staleWhileRevalidate: true,
      maxStaleAge: 600 // Serve stale data for up to 10 minutes while revalidating
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { analysisEngine: engine } = await initializeServices();
      if (!engine) {
        return res.status(500).json({ error: 'Analysis engine not initialized' });
      }

      const startTime = Date.now();
      
      // Get high-level summary data
      const totalCount = await engine.getDataStore().count();
      if (totalCount === 0) {
        return res.json({
          totalRequests: 0,
          timeRange: null,
          topEndpoints: [],
          errorRate: 0,
          avgResponseTime: 0,
          processingTime: Date.now() - startTime
        });
      }

      // Get recent data for summary (last 10k records for speed)
      const recentData = await engine.getDataStore().queryPaginated({}, 1, Math.min(10000, totalCount));
      const analysisResult = await engine.analyzeTrafficPatterns({});
      
      const summary = {
        totalRequests: totalCount,
        analyzedRequests: recentData.data.length,
        timeRange: recentData.data.length > 0 ? {
          start: recentData.data[recentData.data.length - 1].timestamp,
          end: recentData.data[0].timestamp
        } : null,
        topEndpoints: analysisResult.metrics.endpointStats.slice(0, 10),
        statusCodeDistribution: analysisResult.metrics.statusCodeDistribution,
        errorRate: analysisResult.metrics.statusCodeDistribution
          .filter(s => s.statusCode >= 400)
          .reduce((sum, s) => sum + s.percentage, 0),
        avgResponseTime: analysisResult.metrics.responseTimePercentiles.average,
        peakPeriods: analysisResult.metrics.peakPeriods.slice(0, 3),
        processingTime: Date.now() - startTime
      };

      res.json(summary);

    } catch (error) {
      console.error('Summary endpoint error:', error);
      res.status(500).json({
        error: 'Failed to generate summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/analysis/cached/patterns
 * Pattern analysis with extended caching
 */
router.get('/patterns',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    return cacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.PATTERN,
      keyGenerator: (req) => getCacheKey('patterns', req.query, req.query.timeframe || 'all'),
      ttl: CACHE_STRATEGIES.ANALYSIS.ttl,
      compress: true,
      tags: ['patterns', 'analysis', 'ml']
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { analysisEngine: engine } = await initializeServices();
      if (!engine) {
        return res.status(500).json({ error: 'Analysis engine not initialized' });
      }

      const startTime = Date.now();
      
      // Parse timeframe
      const timeframe = req.query.timeframe as string || 'day';
      let filters: FilterCriteria = {};
      
      // Set time range based on timeframe
      const now = new Date();
      switch (timeframe) {
        case 'hour':
          filters.timeRange = {
            start: new Date(now.getTime() - 60 * 60 * 1000),
            end: now
          };
          break;
        case 'day':
          filters.timeRange = {
            start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            end: now
          };
          break;
        case 'week':
          filters.timeRange = {
            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            end: now
          };
          break;
      }

      const analysisResult = await engine.analyzeTrafficPatterns(filters);
      
      // Extract pattern-specific data
      const patterns = {
        errorPatterns: analysisResult.metrics.errorPatterns,
        peakPeriods: analysisResult.metrics.peakPeriods,
        statusCodeTrends: analysisResult.metrics.statusCodeTrends,
        topUserAgents: analysisResult.metrics.userAgentStats.slice(0, 10),
        topClientIps: analysisResult.metrics.clientIpStats.slice(0, 20),
        timeframe,
        processingTime: Date.now() - startTime,
        dataPoints: analysisResult.filteredEntryCount
      };

      res.json(patterns);

    } catch (error) {
      console.error('Patterns endpoint error:', error);
      res.status(500).json({
        error: 'Failed to analyze patterns',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/analysis/cached/aggregations/:type
 * Parameterized aggregations with namespace-specific caching
 */
router.get('/aggregations/:type',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    const aggregationType = req.params.type;
    
    return cacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.AGGREGATION,
      keyGenerator: (req) => getCacheKey(aggregationType, req.query, req.params),
      ttl: CACHE_STRATEGIES.AGGREGATED.ttl,
      compress: true,
      tags: ['aggregation', aggregationType, 'dashboard']
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { analysisEngine: engine } = await initializeServices();
      if (!engine) {
        return res.status(500).json({ error: 'Analysis engine not initialized' });
      }

      const aggregationType = req.params.type;
      const startTime = Date.now();
      
      // Parse common query parameters
      const limit = parseInt(req.query.limit as string || '50');
      const filters: FilterCriteria = {};
      
      if (req.query.startDate && req.query.endDate) {
        filters.timeRange = {
          start: new Date(req.query.startDate as string),
          end: new Date(req.query.endDate as string)
        };
      }

      const analysisResult = await engine.analyzeTrafficPatterns(filters);
      let aggregationData: any;

      switch (aggregationType) {
        case 'status-codes':
          aggregationData = {
            distribution: analysisResult.metrics.statusCodeDistribution,
            trends: analysisResult.metrics.statusCodeTrends,
            type: 'status-codes'
          };
          break;

        case 'endpoints':
          aggregationData = {
            stats: analysisResult.metrics.endpointStats.slice(0, limit),
            total: analysisResult.metrics.endpointStats.length,
            type: 'endpoints'
          };
          break;

        case 'response-times':
          aggregationData = {
            percentiles: analysisResult.metrics.responseTimePercentiles,
            breakdown: analysisResult.metrics.responseTimeBreakdown,
            type: 'response-times'
          };
          break;

        case 'client-ips':
          aggregationData = {
            stats: analysisResult.metrics.clientIpStats.slice(0, limit),
            total: analysisResult.metrics.clientIpStats.length,
            type: 'client-ips'
          };
          break;

        case 'user-agents':
          aggregationData = {
            stats: analysisResult.metrics.userAgentStats.slice(0, limit),
            total: analysisResult.metrics.userAgentStats.length,
            type: 'user-agents'
          };
          break;

        default:
          return res.status(400).json({
            error: 'Invalid aggregation type',
            validTypes: ['status-codes', 'endpoints', 'response-times', 'client-ips', 'user-agents']
          });
      }

      res.json({
        ...aggregationData,
        processingTime: Date.now() - startTime,
        dataPoints: analysisResult.filteredEntryCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Aggregation ${req.params.type} endpoint error:`, error);
      res.status(500).json({
        error: `Failed to generate ${req.params.type} aggregation`,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/analysis/cached/invalidate
 * Manual cache invalidation endpoint
 */
router.post('/invalidate',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    return cacheInvalidationMiddleware(cm.getCache(), {
      invalidateOn: ['POST'],
      namespaces: [CacheNamespace.ANALYSIS, CacheNamespace.AGGREGATION, CacheNamespace.PATTERN],
      tags: ['manual-invalidation']
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { cacheManager: cm } = await initializeServices();
      if (!cm) {
        return res.status(500).json({ error: 'Cache manager not initialized' });
      }

      const { namespace, pattern, tags } = req.body;
      
      let invalidatedCount = 0;
      
      if (namespace) {
        invalidatedCount += await cm.getCache().invalidate({ namespace });
      }
      
      if (pattern) {
        invalidatedCount += await cm.getCache().invalidate({ pattern });
      }
      
      if (tags) {
        invalidatedCount += await cm.getCache().invalidate({ tags });
      }
      
      // If nothing specific provided, invalidate all analysis caches
      if (!namespace && !pattern && !tags) {
        invalidatedCount += await cm.getCache().invalidate({ namespace: CacheNamespace.ANALYSIS });
        invalidatedCount += await cm.getCache().invalidate({ namespace: CacheNamespace.AGGREGATION });
        invalidatedCount += await cm.getCache().invalidate({ namespace: CacheNamespace.PATTERN });
      }

      res.json({
        success: true,
        invalidatedCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Cache invalidation error:', error);
      res.status(500).json({
        error: 'Failed to invalidate cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/analysis/cached/status
 * Cache status and health endpoint
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) {
      return res.status(500).json({ error: 'Cache manager not initialized' });
    }

    const status = await cm.getStatus();
    const report = await cm.generateReport();
    
    res.json({
      initialized: cm.isInitialized(),
      status,
      report,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cache status error:', error);
    res.status(500).json({
      error: 'Failed to get cache status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/analysis/cached/warmup
 * Manual cache warmup endpoint
 */
router.post('/warmup', async (req: Request, res: Response) => {
  try {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) {
      return res.status(500).json({ error: 'Cache manager not initialized' });
    }

    const { scenario, priorities } = req.body;
    
    if (scenario) {
      await cm.preloadForScenario(scenario);
    } else if (priorities) {
      await cm.getWarming().scheduleWarmup(priorities);
    } else {
      // Default warmup
      await cm.getWarming().scheduleWarmup();
    }

    const stats = cm.getWarming().getStats();
    
    res.json({
      success: true,
      warmupStats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cache warmup error:', error);
    res.status(500).json({
      error: 'Failed to warmup cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;