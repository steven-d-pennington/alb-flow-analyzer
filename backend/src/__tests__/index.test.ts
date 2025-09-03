import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Create test app without starting server
const createTestApp = () => {
  const app = express();
  
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'alb-flow-analyzer-backend'
    });
  });

  app.use('/api', (req, res) => {
    res.json({ message: 'ALB Flow Analyzer API - Routes will be implemented in subsequent tasks' });
  });

  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
};

describe('Backend API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should respond to health check', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'alb-flow-analyzer-backend');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should respond to API placeholder', async () => {
    const response = await request(app)
      .get('/api')
      .expect(200);
    
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('ALB Flow Analyzer API');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/unknown-route')
      .expect(404);
    
    expect(response.body).toHaveProperty('error', 'Route not found');
  });
});