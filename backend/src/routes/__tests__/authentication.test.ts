import request from 'supertest';
import express from 'express';
import authRoutes from '../auth';

describe('Authentication Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  describe('POST /api/auth/credentials', () => {
    it('should return 400 for missing required fields', async () => {
      const incompleteCredentials = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE'
        // Missing secretAccessKey and region
      };

      const response = await request(app)
        .post('/api/auth/credentials')
        .send(incompleteCredentials)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing required fields',
        message: 'accessKeyId, secretAccessKey, and region are required'
      });
    });

    it('should return 401 for invalid credentials', async () => {
      const invalidCredentials = {
        accessKeyId: 'INVALID_KEY',
        secretAccessKey: 'INVALID_SECRET',
        region: 'us-east-1'
      };

      const response = await request(app)
        .post('/api/auth/credentials')
        .send(invalidCredentials)
        .expect(401);

      expect(response.body).toEqual({
        error: 'Invalid credentials',
        message: 'The provided AWS credentials are invalid or lack necessary permissions'
      });
    });
  });

  describe('POST /api/auth/test', () => {
    it('should return 400 for missing fields', async () => {
      const incompleteCredentials = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE'
      };

      const response = await request(app)
        .post('/api/auth/test')
        .send(incompleteCredentials)
        .expect(400);

      expect(response.body).toEqual({
        valid: false,
        error: 'Missing required fields'
      });
    });

    it('should return invalid for bad credentials', async () => {
      const invalidCredentials = {
        accessKeyId: 'INVALID_KEY',
        secretAccessKey: 'INVALID_SECRET',
        region: 'us-east-1'
      };

      const response = await request(app)
        .post('/api/auth/test')
        .send(invalidCredentials)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.message).toBe('Credentials are invalid');
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return 401 for missing authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .expect(401);

      expect(response.body).toEqual({
        error: 'No session token provided',
        message: 'Authorization header with Bearer token is required'
      });
    });

    it('should return 401 for invalid session token', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Invalid session',
        message: 'Invalid session token'
      });
    });
  });

  describe('DELETE /api/auth/session', () => {
    it('should return 401 for missing authorization header', async () => {
      const response = await request(app)
        .delete('/api/auth/session')
        .expect(401);

      expect(response.body).toEqual({
        error: 'No session token provided',
        message: 'Authorization header with Bearer token is required'
      });
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return service status', async () => {
      const response = await request(app)
        .get('/api/auth/status')
        .expect(200);

      expect(response.body).toMatchObject({
        service: 'Authentication Service',
        status: 'operational'
      });

      expect(response.body.activeSessions).toBeDefined();
      expect(typeof response.body.activeSessions).toBe('number');
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Authorization header parsing', () => {
    it('should handle malformed authorization headers', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body).toEqual({
        error: 'No session token provided',
        message: 'Authorization header with Bearer token is required'
      });
    });

    it('should handle empty bearer token', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body).toEqual({
        error: 'No session token provided',
        message: 'Authorization header with Bearer token is required'
      });
    });
  });
});