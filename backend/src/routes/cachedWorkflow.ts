/**
 * Cached workflow routes with comprehensive caching strategies
 */

import { Router, Request, Response } from 'express';
import { WorkflowAnalysisService, WorkflowAnalysisOptions } from '../analysis/WorkflowAnalysisService';
import { createDataStore, FilterCriteria } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { 
  paginationMiddleware, 
  validatePagination, 
  parsePaginationParams,
  createPaginatedResponse,
  paginationToFilterCriteria,
  PaginationParams
} from '../utils/pagination';

// Cache imports
import {
  CacheManager,
  CacheNamespace,
  cacheMiddleware,
  smartCacheMiddleware,
  getCacheKey,
  CACHE_STRATEGIES
} from '../cache';

const router = Router();

// Cache manager and service instances
let cacheManager: CacheManager | null = null;
let workflowService: WorkflowAnalysisService | null = null;

const initializeServices = async () => {
  if (!workflowService || !cacheManager) {
    try {
      console.log('Initializing cached workflow services...');
      
      // Initialize cache manager if not exists
      if (!cacheManager) {
        const cacheConfig = {
          type: process.env.NODE_ENV === 'production' ? 'redis' : 'hybrid',
          redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            keyPrefix: 'alb:workflow:',
          },
          memory: {
            maxSize: process.env.NODE_ENV === 'production' ? 30000 : 8000,
            maxAge: 600, // 10 minutes for workflows
            updateAgeOnGet: true,
          },
          defaultTTL: 600,
          enableCompression: true,
          compressionThreshold: 512, // More aggressive compression for workflows
          enableMetrics: true
        };

        cacheManager = new CacheManager(cacheConfig);
        await cacheManager.initialize();
      }
      
      // Initialize workflow service if not exists
      if (!workflowService) {
        const config = getDatabaseConfig();
        const factory = ConnectionFactory.getInstance();
        const connectionPool = await factory.createPool(config);
        const dataStore = await createDataStore(connectionPool);
        workflowService = new WorkflowAnalysisService(dataStore);
      }
      
      console.log('Cached workflow services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize cached workflow services:', error);
      throw error;
    }
  }
  return { workflowService, cacheManager };
};

/**
 * GET /api/workflow/cached/analysis
 * Comprehensive workflow analysis with smart caching
 */
router.get('/analysis',
  validatePagination({ maxLimit: 1000, defaultLimit: 50 }),
  paginationMiddleware({ maxLimit: 1000, defaultLimit: 50 }),
  async (req: Request & { pagination?: PaginationParams }, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    return smartCacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.WORKFLOW,
      keyGenerator: (req: Request) => {
        const pagination = req.pagination || parsePaginationParams(req.query, { maxLimit: 1000, defaultLimit: 50 });
        return getCacheKey('analysis', req.query, pagination);
      },
      ttl: CACHE_STRATEGIES.ANALYSIS.ttl,
      compress: true,
      tags: (req) => {
        const tags = ['workflow', 'analysis'];
        if (req.query.endpoints) tags.push('filtered-endpoints');
        if (req.query.clientIps) tags.push('filtered-ips');
        if (req.query.startTime || req.query.endTime) tags.push('time-filtered');
        return tags;
      },
      condition: (req, res) => req.method === 'GET' && res.statusCode < 400,
      staleWhileRevalidate: true,
      maxStaleAge: 300 // 5 minutes stale tolerance
    })(req, res, next);
  },
  async (req: Request & { pagination?: PaginationParams }, res: Response) => {
    try {
      console.log('Cached workflow analysis endpoint - Starting...');
      const { workflowService: service, cacheManager: cm } = await initializeServices();
      
      if (!service || !cm) {
        return res.status(500).json({ error: 'Services not initialized' });
      }

      const startTime = Date.now();
      
      // Parse filters from query parameters
      const filters: FilterCriteria = {};
      const options: WorkflowAnalysisOptions = {};
      
      if (req.query.startTime && req.query.endTime) {
        filters.timeRange = {
          start: new Date(req.query.startTime as string),
          end: new Date(req.query.endTime as string)
        };
      }
      
      if (req.query.endpoints) {
        const endpoints = Array.isArray(req.query.endpoints) 
          ? req.query.endpoints as string[]
          : [req.query.endpoints as string];
        filters.endpoints = endpoints;
      }
      
      if (req.query.clientIps) {
        const clientIps = Array.isArray(req.query.clientIps)
          ? req.query.clientIps as string[]
          : [req.query.clientIps as string];
        filters.clientIps = clientIps;
      }

      // Parse workflow analysis options
      if (req.query.excludeEndpoints) {
        const excludeEndpoints = Array.isArray(req.query.excludeEndpoints)
          ? req.query.excludeEndpoints as string[]
          : [req.query.excludeEndpoints as string];
        options.excludeEndpoints = excludeEndpoints;
      }

      if (req.query.includeOnlyEndpoints) {
        const includeOnlyEndpoints = Array.isArray(req.query.includeOnlyEndpoints)
          ? req.query.includeOnlyEndpoints as string[]
          : [req.query.includeOnlyEndpoints as string];
        options.includeOnlyEndpoints = includeOnlyEndpoints;
      }

      if (req.query.excludeUserAgents) {
        const excludeUserAgents = Array.isArray(req.query.excludeUserAgents)
          ? req.query.excludeUserAgents as string[]
          : [req.query.excludeUserAgents as string];
        options.excludeUserAgents = excludeUserAgents;
      }

      if (req.query.minSessionDuration) {
        options.minSessionDuration = parseInt(req.query.minSessionDuration as string);
      }

      if (req.query.maxSessionDuration) {
        options.maxSessionDuration = parseInt(req.query.maxSessionDuration as string);
      }

      // Get pagination parameters
      const paginationParams = req.pagination || parsePaginationParams(req.query, { maxLimit: 1000, defaultLimit: 50 });

      console.log('Starting workflow analysis with filters:', filters, 'options:', options);
      
      // Run workflow analysis
      const analysisResult = await service.analyzeWorkflows(filters, options);
      const processingTime = Date.now() - startTime;
      
      // For pagination, we need to paginate the workflows
      const totalWorkflows = analysisResult.workflows.length;
      const startIndex = (paginationParams.page - 1) * paginationParams.limit;
      const endIndex = startIndex + paginationParams.limit;
      const paginatedWorkflows = analysisResult.workflows.slice(startIndex, endIndex);
      
      const paginatedResult = {
        ...analysisResult,
        workflows: paginatedWorkflows,
        pagination: {
          currentPage: paginationParams.page,
          totalPages: Math.ceil(totalWorkflows / paginationParams.limit),
          totalWorkflows,
          pageSize: paginatedWorkflows.length
        }
      };

      // Record performance metrics
      cm.getMonitoring().recordPerformance({
        operationId: `workflow-analysis-${Date.now()}`,
        operation: 'get',
        namespace: 'workflow',
        key: 'analysis',
        duration: processingTime,
        success: true,
        size: JSON.stringify(paginatedResult).length
      });

      // Add processing metadata
      res.set('X-Processing-Time', processingTime.toString());
      res.set('X-Total-Workflows', totalWorkflows.toString());
      res.set('X-Sessions-Analyzed', analysisResult.totalSessions.toString());

      const response = createPaginatedResponse(
        [paginatedResult],
        paginationParams,
        1,
        processingTime
      );

      res.json(response);

    } catch (error) {
      console.error('Cached workflow analysis error:', error);
      const { cacheManager: cm } = await initializeServices();
      if (cm) {
        cm.getMonitoring().recordPerformance({
          operationId: `workflow-error-${Date.now()}`,
          operation: 'get',
          namespace: 'workflow',
          key: 'analysis',
          duration: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      res.status(500).json({
        error: 'Workflow analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/workflow/cached/summary
 * Quick workflow summary with extended caching
 */
router.get('/summary',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    return cacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.WORKFLOW,
      keyGenerator: (req) => getCacheKey('summary', req.query.timeframe || 'default'),
      ttl: CACHE_STRATEGIES.AGGREGATED.ttl, // 30 minutes
      compress: true,
      tags: ['workflow', 'summary', 'dashboard'],
      staleWhileRevalidate: true,
      maxStaleAge: 900 // 15 minutes stale tolerance for summaries
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { workflowService: service } = await initializeServices();
      if (!service) {
        return res.status(500).json({ error: 'Workflow service not initialized' });
      }

      const startTime = Date.now();
      const timeframe = req.query.timeframe as string || 'day';
      
      // Set time filters based on timeframe
      let filters: FilterCriteria = {};
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

      // Run analysis with lightweight options for summary
      const options: WorkflowAnalysisOptions = {
        maxWorkflows: 100, // Limit workflows for summary
        minSessionLength: 2 // Only meaningful sessions
      };

      const analysisResult = await service.analyzeWorkflows(filters, options);
      
      // Generate summary statistics
      const totalWorkflows = analysisResult.workflows.length;
      const totalSessions = analysisResult.totalSessions;
      const avgWorkflowLength = totalWorkflows > 0 
        ? analysisResult.workflows.reduce((sum, w) => sum + w.steps.length, 0) / totalWorkflows
        : 0;
      
      const commonPatterns = analysisResult.commonPatterns.slice(0, 10);
      const topEndpoints = Array.from(new Set(
        analysisResult.workflows
          .flatMap(w => w.steps.map(s => s.endpoint))
          .slice(0, 20)
      ));

      const summary = {
        timeframe,
        totalWorkflows,
        totalSessions,
        avgWorkflowLength: Math.round(avgWorkflowLength * 100) / 100,
        commonPatterns,
        topEndpoints,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      res.json(summary);

    } catch (error) {
      console.error('Workflow summary error:', error);
      res.status(500).json({
        error: 'Failed to generate workflow summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/workflow/cached/patterns/:type
 * Specific workflow pattern analysis with caching
 */
router.get('/patterns/:type',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    const patternType = req.params.type;
    
    return cacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.PATTERN,
      keyGenerator: (req) => getCacheKey('workflow-patterns', patternType, req.query),
      ttl: CACHE_STRATEGIES.ANALYSIS.ttl,
      compress: true,
      tags: ['workflow', 'patterns', patternType]
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { workflowService: service } = await initializeServices();
      if (!service) {
        return res.status(500).json({ error: 'Workflow service not initialized' });
      }

      const patternType = req.params.type;
      const startTime = Date.now();
      
      // Parse filters
      const filters: FilterCriteria = {};
      if (req.query.startTime && req.query.endTime) {
        filters.timeRange = {
          start: new Date(req.query.startTime as string),
          end: new Date(req.query.endTime as string)
        };
      }

      const analysisResult = await service.analyzeWorkflows(filters);
      let patternData: any;

      switch (patternType) {
        case 'common':
          patternData = {
            patterns: analysisResult.commonPatterns,
            totalPatterns: analysisResult.commonPatterns.length,
            type: 'common'
          };
          break;

        case 'error':
          // Filter workflows that contain error steps
          const errorWorkflows = analysisResult.workflows.filter(w => 
            w.steps.some(s => s.statusCode >= 400)
          );
          patternData = {
            errorWorkflows,
            errorPatterns: errorWorkflows.map(w => ({
              pattern: w.steps.map(s => `${s.endpoint}:${s.statusCode}`).join(' -> '),
              frequency: 1,
              avgDuration: w.duration
            })),
            totalErrorWorkflows: errorWorkflows.length,
            type: 'error'
          };
          break;

        case 'abandonment':
          // Find workflows that seem abandoned (end with 4xx/5xx or incomplete)
          const abandonedWorkflows = analysisResult.workflows.filter(w => {
            const lastStep = w.steps[w.steps.length - 1];
            return lastStep.statusCode >= 400 || w.steps.length < 3;
          });
          patternData = {
            abandonedWorkflows,
            abandonmentRate: (abandonedWorkflows.length / analysisResult.workflows.length) * 100,
            commonAbandonmentPoints: Array.from(new Set(
              abandonedWorkflows.map(w => w.steps[w.steps.length - 1].endpoint)
            )).slice(0, 10),
            type: 'abandonment'
          };
          break;

        case 'conversion':
          // Find successful completion patterns
          const successfulWorkflows = analysisResult.workflows.filter(w => 
            w.steps.every(s => s.statusCode < 400) && w.steps.length >= 3
          );
          patternData = {
            successfulWorkflows,
            conversionRate: (successfulWorkflows.length / analysisResult.workflows.length) * 100,
            conversionPatterns: successfulWorkflows.slice(0, 20).map(w => ({
              pattern: w.steps.map(s => s.endpoint).join(' -> '),
              duration: w.duration,
              steps: w.steps.length
            })),
            type: 'conversion'
          };
          break;

        default:
          return res.status(400).json({
            error: 'Invalid pattern type',
            validTypes: ['common', 'error', 'abandonment', 'conversion']
          });
      }

      res.json({
        ...patternData,
        processingTime: Date.now() - startTime,
        totalWorkflowsAnalyzed: analysisResult.workflows.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Workflow pattern ${req.params.type} error:`, error);
      res.status(500).json({
        error: `Failed to analyze ${req.params.type} patterns`,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/workflow/cached/sessions/:sessionId
 * Cached session detail with session-specific caching
 */
router.get('/sessions/:sessionId',
  async (req: Request, res: Response, next) => {
    const { cacheManager: cm } = await initializeServices();
    if (!cm) return next();
    
    return cacheMiddleware(cm.getCache(), {
      namespace: CacheNamespace.SESSION,
      keyGenerator: (req) => getCacheKey('session', req.params.sessionId),
      ttl: CACHE_STRATEGIES.REFERENCE.ttl, // 1 hour for specific sessions
      compress: false, // Don't compress individual sessions
      tags: ['session', 'detail']
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const { workflowService: service } = await initializeServices();
      if (!service) {
        return res.status(500).json({ error: 'Workflow service not initialized' });
      }

      const sessionId = req.params.sessionId;
      const startTime = Date.now();
      
      // Get session-specific workflow
      const filters: FilterCriteria = {
        clientIps: [sessionId] // Assuming sessionId maps to clientIp for now
      };
      
      const analysisResult = await service.analyzeWorkflows(filters);
      
      if (analysisResult.workflows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          sessionId
        });
      }

      const sessionWorkflow = analysisResult.workflows[0]; // Get first workflow for this session
      
      res.json({
        sessionId,
        workflow: sessionWorkflow,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Session ${req.params.sessionId} error:`, error);
      res.status(500).json({
        error: 'Failed to retrieve session',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;