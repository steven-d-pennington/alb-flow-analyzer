import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth';
import analysisRoutes from './routes/analysis';
import analysisSimpleRoutes from './routes/analysis-simple';
// import cachedAnalysisRoutes from './routes/cachedAnalysis'; // Temporarily disabled due to type errors
import s3Routes from './routes/s3';
// import { createFilesRouter } from './routes/files'; // Temporarily disabled due to type errors
import exportRoutes from './routes/export';
import downloadsRoutes, { setWebSocketServer as setDownloadsWebSocketServer } from './routes/downloads';
import processingRoutes, { setWebSocketServer as setProcessingWebSocketServer } from './routes/processing';
import databaseRoutes from './routes/database';
// import workflowRoutes from './routes/workflow'; // Temporarily disabled
// import cachedWorkflowRoutes from './routes/cachedWorkflow'; // Temporarily disabled due to type errors
import { ALBWebSocketServer } from './websocket/WebSocketServer';
// import { CacheManager, DEFAULT_CACHE_CONFIG, PRODUCTION_CACHE_CONFIG, DEVELOPMENT_CACHE_CONFIG } from './cache'; // Temporarily disabled

// Load environment variables from .env and .env.local
// Use override: true to override existing environment variables
const envLocalResult = dotenv.config({ path: './.env.local', override: true }); // Load .env.local first (highest priority)
const envResult = dotenv.config({ path: './.env' }); // Load .env as fallback (don't override .env.local)

// Debug environment loading
console.log('📁 Loading environment variables...');
if (envLocalResult.error) {
  console.log('⚠️  .env.local not found or error:', envLocalResult.error.message);
} else {
  console.log('✅ .env.local loaded successfully');
}
if (envResult.error) {
  console.log('⚠️  .env not found or error:', envResult.error.message);
} else {
  console.log('✅ .env loaded successfully');
}

// Check AWS credentials
console.log('🔑 AWS Credentials Check:');
console.log('  - AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 10)}...` : 'NOT SET');
console.log('  - AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '***SET***' : 'NOT SET');
console.log('  - AWS_SESSION_TOKEN:', process.env.AWS_SESSION_TOKEN ? '***SET***' : 'NOT SET');
console.log('  - AWS_REGION:', process.env.AWS_REGION || 'NOT SET');

const app = express();

const PORT = process.env.PORT || 3001;

// Initialize cache manager (temporarily disabled)
// let cacheManager: CacheManager | null = null;

const initializeCacheManager = async () => {
  // Temporarily disabled due to type errors
  return null;
  /*
  if (!cacheManager) {
    try {
      console.log('🗄️  Initializing cache manager...');
      
      // Select cache configuration based on environment
      let cacheConfig;
      if (process.env.NODE_ENV === 'production') {
        cacheConfig = PRODUCTION_CACHE_CONFIG;
      } else if (process.env.NODE_ENV === 'development') {
        cacheConfig = DEVELOPMENT_CACHE_CONFIG;
      } else {
        cacheConfig = DEFAULT_CACHE_CONFIG;
      }

      // Override with environment-specific settings
      cacheConfig = {
        ...cacheConfig,
        redis: {
          ...cacheConfig.redis,
          host: process.env.REDIS_HOST || cacheConfig.redis.host,
          port: parseInt(process.env.REDIS_PORT || cacheConfig.redis.port.toString()),
          password: process.env.REDIS_PASSWORD || cacheConfig.redis.password
        }
      };

      cacheManager = new CacheManager(cacheConfig);
      await cacheManager.initialize();
      
      console.log('✅ Cache manager initialized successfully');
      
      // Set up cache event listeners for ingestion
      // This will be called when data is ingested
      global.onDataIngestion = async (event: any) => {
        if (cacheManager) {
          await cacheManager.onDataIngestion(event);
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to initialize cache manager:', error);
      console.log('⚠️  Continuing without caching...');
    }
  }
  return cacheManager;
  */
};

// Create HTTP server for WebSocket support
const server = createServer(app);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting (more lenient for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 1000, // Higher limit for development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});
app.use(limiter);

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (cache disabled)
app.get('/health', async (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'alb-flow-analyzer-backend',
    cache: { status: 'disabled' }
  });
});

// Initialize WebSocket server
const wsServer = new ALBWebSocketServer(server);

// Pass WebSocket server to downloads and processing routes
setDownloadsWebSocketServer(wsServer);
setProcessingWebSocketServer(wsServer);

// Create routes with WebSocket support (temporarily disabled)
// const filesRoutes = createFilesRouter(wsServer);

// Initialize cache manager on startup (temporarily disabled)
// initializeCacheManager().catch(console.error);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/analysis-simple', analysisSimpleRoutes); // Simple analysis routes with pagination
// app.use('/api/analysis/cached', cachedAnalysisRoutes); // Cached analysis routes (temporarily disabled)
// app.use('/api/files', filesRoutes); // Temporarily disabled
app.use('/api/s3', s3Routes);
app.use('/api/export', exportRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/database', databaseRoutes);
// app.use('/api/workflow', workflowRoutes); // Temporarily disabled
// app.use('/api/workflow/cached', cachedWorkflowRoutes); // Cached workflow routes (temporarily disabled)

// Cache management endpoints (temporarily disabled)
/*
app.get('/api/cache/status', async (req, res) => {
  try {
    const cm = await initializeCacheManager();
    if (!cm) {
      return res.status(503).json({ error: 'Cache manager not available' });
    }
    const status = await cm.getStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get cache status' });
  }
});

app.post('/api/cache/warmup', async (req, res) => {
  try {
    const cm = await initializeCacheManager();
    if (!cm) {
      return res.status(503).json({ error: 'Cache manager not available' });
    }
    
    const { scenario } = req.body;
    if (scenario) {
      await cm.preloadForScenario(scenario);
    } else {
      await cm.getWarming().scheduleWarmup();
    }
    
    return res.json({ success: true, message: 'Cache warmup initiated' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to warmup cache' });
  }
});

app.delete('/api/cache/clear', async (req, res) => {
  try {
    const cm = await initializeCacheManager();
    if (!cm) {
      return res.status(503).json({ error: 'Cache manager not available' });
    }
    
    await cm.getCache().clear();
    return res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to clear cache' });
  }
});
*/

// API routes placeholder for other endpoints
app.use('/api', (req, res) => {
  res.json({ message: 'ALB Flow Analyzer API - Additional routes will be implemented in subsequent tasks' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, async () => {
  console.log(`🚀 ALB Flow Analyzer Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server available at ws://localhost:${PORT}/ws`);
  
  // Initialize authentication service with environment credentials AFTER env vars are loaded
  console.log('🔧 Reinitializing AuthenticationService with environment credentials...');
  const { AuthenticationService } = await import('./auth/AuthenticationService');
  await AuthenticationService.reinitializeFromEnvironment();
  const authService = AuthenticationService.getInstance();
  console.log('✅ AuthenticationService reinitialization complete with fresh credentials');
  
  // Check if default credentials are available
  const defaultToken = authService.getDefaultSessionToken();
  if (defaultToken) {
    console.log('🔑 Default AWS session is available for API calls');
  } else {
    console.log('⚠️  No default AWS session available');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close cache manager first (temporarily disabled)
  /*
  if (cacheManager) {
    try {
      console.log('🗄️  Shutting down cache manager...');
      await cacheManager.shutdown();
      console.log('✅ Cache manager shut down successfully');
    } catch (error) {
      console.error('❌ Error shutting down cache manager:', error);
    }
  }
  */
  
  // Close WebSocket server
  wsServer.close();
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle SIGINT (Ctrl+C) as well
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Cache manager disabled
  /*
  if (cacheManager) {
    try {
      await cacheManager.shutdown();
    } catch (error) {
      console.error('Error shutting down cache manager:', error);
    }
  }
  */
  
  wsServer.close();
  server.close(() => {
    process.exit(0);
  });
});

export default app;
export { wsServer };