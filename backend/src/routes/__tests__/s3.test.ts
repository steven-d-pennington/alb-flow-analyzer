import request from 'supertest';
import express from 'express';
import s3Routes from '../s3';
import { S3IntegrationService } from '../../s3/S3IntegrationService';
import { AuthenticationService } from '../../auth/AuthenticationService';
import { AWSCredentials } from '../../auth/types';
import { S3Bucket, S3Object, S3SearchCriteria } from '../../s3/types';

// Mock the services
jest.mock('../../s3/S3IntegrationService');
jest.mock('../../auth/AuthenticationService');

const MockedS3IntegrationService = S3IntegrationService as jest.MockedClass<typeof S3IntegrationService>;
const MockedAuthenticationService = AuthenticationService as jest.MockedClass<typeof AuthenticationService>;

describe('S3 Routes', () => {
  let app: express.Application;
  let mockS3Service: jest.Mocked<S3IntegrationService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;

  const mockCredentials: AWSCredentials = {
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    region: 'us-east-1',
    sessionToken: 'test-session-token'
  };

  const mockSessionToken = 'valid-session-token';

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockS3Service = jest.createMockFromModule('../../s3/S3IntegrationService') as jest.Mocked<S3IntegrationService>;
    mockAuthService = jest.createMockFromModule('../../auth/AuthenticationService') as jest.Mocked<AuthenticationService>;

    // Override specific methods we need
    mockS3Service.listBuckets = jest.fn();
    mockS3Service.listObjects = jest.fn();
    mockS3Service.searchLogFiles = jest.fn();
    mockS3Service.downloadObject = jest.fn();
    mockS3Service.getObjectMetadata = jest.fn();

    mockAuthService.validateCredentials = jest.fn();
    mockAuthService.storeCredentials = jest.fn();
    mockAuthService.getCredentials = jest.fn();
    mockAuthService.revokeSession = jest.fn();
    mockAuthService.getActiveSessionCount = jest.fn();

    // Mock the service constructors
    (S3IntegrationService as jest.Mock).mockImplementation(() => mockS3Service);
    (AuthenticationService as jest.Mock).mockImplementation(() => mockAuthService);

    // Default mock for getCredentials
    mockAuthService.getCredentials.mockResolvedValue(mockCredentials);

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/s3', s3Routes);
  });

  describe('GET /api/s3/buckets', () => {
    const mockBuckets: S3Bucket[] = [
      {
        name: 'test-bucket-1',
        creationDate: new Date('2023-01-01T00:00:00Z')
      },
      {
        name: 'test-bucket-2',
        creationDate: new Date('2023-02-01T00:00:00Z')
      }
    ];

    const expectedBuckets = [
      {
        name: 'test-bucket-1',
        creationDate: '2023-01-01T00:00:00.000Z'
      },
      {
        name: 'test-bucket-2',
        creationDate: '2023-02-01T00:00:00.000Z'
      }
    ];

    it('should list buckets successfully with valid session token', async () => {
      mockS3Service.listBuckets.mockResolvedValue(mockBuckets);

      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(200);

      expect(response.body).toEqual({
        buckets: expectedBuckets,
        count: 2,
        timestamp: expect.any(String)
      });

      expect(mockAuthService.getCredentials).toHaveBeenCalledWith(mockSessionToken);
      expect(mockS3Service.listBuckets).toHaveBeenCalledWith(mockCredentials);
    });

    it('should return 401 when no session token provided', async () => {
      const response = await request(app)
        .get('/api/s3/buckets')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required',
        message: 'No session token provided'
      });

      expect(mockAuthService.getCredentials).not.toHaveBeenCalled();
      expect(mockS3Service.listBuckets).not.toHaveBeenCalled();
    });

    it('should return 401 when session token is invalid', async () => {
      mockAuthService.getCredentials.mockRejectedValue(new Error('Invalid session token'));

      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', `Bearer invalid-token`)
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required',
        message: 'Invalid session token'
      });

      expect(mockS3Service.listBuckets).not.toHaveBeenCalled();
    });

    it('should return 500 when S3 service fails', async () => {
      mockS3Service.listBuckets.mockRejectedValue(new Error('S3 service error'));

      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to list buckets',
        message: 'S3 service error'
      });
    });
  });

  describe('GET /api/s3/objects', () => {
    const mockObjects: S3Object[] = [
      {
        key: 'logs/2023/01/01/log1.gz',
        size: 1024,
        lastModified: new Date('2023-01-01T12:00:00Z'),
        etag: '"abc123"',
        storageClass: 'STANDARD'
      },
      {
        key: 'logs/2023/01/01/log2.gz',
        size: 2048,
        lastModified: new Date('2023-01-01T13:00:00Z'),
        etag: '"def456"',
        storageClass: 'STANDARD'
      }
    ];

    const expectedObjects = [
      {
        key: 'logs/2023/01/01/log1.gz',
        size: 1024,
        lastModified: '2023-01-01T12:00:00.000Z',
        etag: '"abc123"',
        storageClass: 'STANDARD'
      },
      {
        key: 'logs/2023/01/01/log2.gz',
        size: 2048,
        lastModified: '2023-01-01T13:00:00.000Z',
        etag: '"def456"',
        storageClass: 'STANDARD'
      }
    ];

    it('should list objects successfully with bucket parameter', async () => {
      mockS3Service.listObjects.mockResolvedValue(mockObjects);

      const response = await request(app)
        .get('/api/s3/objects?bucket=test-bucket')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(200);

      expect(response.body).toEqual({
        bucket: 'test-bucket',
        prefix: '',
        objects: expectedObjects,
        count: 2,
        timestamp: expect.any(String)
      });

      expect(mockS3Service.listObjects).toHaveBeenCalledWith('test-bucket', '', mockCredentials);
    });

    it('should list objects with prefix parameter', async () => {
      mockS3Service.listObjects.mockResolvedValue(mockObjects);

      const response = await request(app)
        .get('/api/s3/objects?bucket=test-bucket&prefix=logs/2023/')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(200);

      expect(response.body).toEqual({
        bucket: 'test-bucket',
        prefix: 'logs/2023/',
        objects: expectedObjects,
        count: 2,
        timestamp: expect.any(String)
      });

      expect(mockS3Service.listObjects).toHaveBeenCalledWith('test-bucket', 'logs/2023/', mockCredentials);
    });

    it('should return 400 when bucket parameter is missing', async () => {
      const response = await request(app)
        .get('/api/s3/objects')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });

      expect(mockS3Service.listObjects).not.toHaveBeenCalled();
    });

    it('should return 401 when no session token provided', async () => {
      const response = await request(app)
        .get('/api/s3/objects?bucket=test-bucket')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required',
        message: 'No session token provided'
      });
    });

    it('should return 500 when S3 service fails', async () => {
      mockS3Service.listObjects.mockRejectedValue(new Error('Failed to list objects'));

      const response = await request(app)
        .get('/api/s3/objects?bucket=test-bucket')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to list objects',
        message: 'Failed to list objects'
      });
    });
  });

  describe('POST /api/s3/search', () => {
    const mockSearchResults: S3Object[] = [
      {
        key: 'logs/alb/2023/01/01/log1.gz',
        size: 1024,
        lastModified: new Date('2023-01-01T12:00:00Z'),
        etag: '"abc123"',
        storageClass: 'STANDARD'
      },
      {
        key: 'logs/alb/2023/01/02/log2.gz',
        size: 2048,
        lastModified: new Date('2023-01-02T12:00:00Z'),
        etag: '"def456"',
        storageClass: 'STANDARD'
      }
    ];

    const expectedSearchResults = [
      {
        key: 'logs/alb/2023/01/01/log1.gz',
        size: 1024,
        lastModified: '2023-01-01T12:00:00.000Z',
        etag: '"abc123"',
        storageClass: 'STANDARD'
      },
      {
        key: 'logs/alb/2023/01/02/log2.gz',
        size: 2048,
        lastModified: '2023-01-02T12:00:00.000Z',
        etag: '"def456"',
        storageClass: 'STANDARD'
      }
    ];

    it('should search objects successfully with basic criteria', async () => {
      mockS3Service.searchLogFiles.mockResolvedValue(mockSearchResults);

      const searchCriteria = {
        prefix: 'logs/alb/',
        recursive: true
      };

      const response = await request(app)
        .post('/api/s3/search')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .send({
          bucket: 'test-bucket',
          searchCriteria
        })
        .expect(200);

      expect(response.body).toEqual({
        bucket: 'test-bucket',
        searchCriteria: {
          prefix: 'logs/alb/',
          fileExtensions: [],
          recursive: true
        },
        objects: expectedSearchResults,
        count: 2,
        timestamp: expect.any(String)
      });

      expect(mockS3Service.searchLogFiles).toHaveBeenCalledWith(
        'test-bucket',
        expect.objectContaining({
          prefix: 'logs/alb/',
          recursive: true
        }),
        mockCredentials
      );
    });

    it('should search objects with advanced filtering criteria', async () => {
      mockS3Service.searchLogFiles.mockResolvedValue(mockSearchResults);

      const searchCriteria = {
        prefix: 'logs/',
        fileExtensions: ['.gz', '.log'],
        dateRange: {
          start: '2023-01-01T00:00:00Z',
          end: '2023-01-31T23:59:59Z'
        },
        maxSize: 10485760, // 10MB
        recursive: true
      };

      const response = await request(app)
        .post('/api/s3/search')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .send({
          bucket: 'test-bucket',
          searchCriteria
        })
        .expect(200);

      expect(response.body.searchCriteria).toEqual({
        prefix: 'logs/',
        fileExtensions: ['.gz', '.log'],
        dateRange: {
          start: '2023-01-01T00:00:00.000Z',
          end: '2023-01-31T23:59:59.000Z'
        },
        maxSize: 10485760,
        recursive: true
      });

      expect(mockS3Service.searchLogFiles).toHaveBeenCalledWith(
        'test-bucket',
        expect.objectContaining({
          prefix: 'logs/',
          fileExtensions: ['.gz', '.log'],
          maxSize: 10485760,
          recursive: true
        }),
        mockCredentials
      );
    });

    it('should use default values when searchCriteria is not provided', async () => {
      mockS3Service.searchLogFiles.mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .post('/api/s3/search')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .send({
          bucket: 'test-bucket'
        })
        .expect(200);

      expect(response.body.searchCriteria).toEqual({
        prefix: '',
        fileExtensions: [],
        recursive: true
      });
    });

    it('should return 400 when bucket parameter is missing', async () => {
      const response = await request(app)
        .post('/api/s3/search')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .send({
          searchCriteria: { recursive: true }
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Missing required parameter',
        message: 'bucket parameter is required'
      });

      expect(mockS3Service.searchLogFiles).not.toHaveBeenCalled();
    });

    it('should return 400 when date format is invalid', async () => {
      const response = await request(app)
        .post('/api/s3/search')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .send({
          bucket: 'test-bucket',
          searchCriteria: {
            dateRange: {
              start: 'invalid-date'
            }
          }
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid date format',
        message: 'dateRange.start must be a valid date'
      });
    });

    it('should return 401 when no session token provided', async () => {
      const response = await request(app)
        .post('/api/s3/search')
        .send({
          bucket: 'test-bucket',
          searchCriteria: { recursive: true }
        })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required',
        message: 'No session token provided'
      });
    });

    it('should return 500 when S3 service fails', async () => {
      mockS3Service.searchLogFiles.mockRejectedValue(new Error('Search failed'));

      const response = await request(app)
        .post('/api/s3/search')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .send({
          bucket: 'test-bucket',
          searchCriteria: { recursive: true }
        })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to search objects',
        message: 'Search failed'
      });
    });
  });

  describe('GET /api/s3/status', () => {
    it('should return service status', async () => {
      const response = await request(app)
        .get('/api/s3/status')
        .expect(200);

      expect(response.body).toEqual({
        service: 'S3 Integration Service',
        status: 'operational',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Authorization header parsing', () => {
    it('should handle missing Authorization header', async () => {
      const response = await request(app)
        .get('/api/s3/buckets')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should handle malformed Authorization header', async () => {
      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should handle empty Bearer token', async () => {
      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle session expired error', async () => {
      mockAuthService.getCredentials.mockRejectedValue(new Error('Session expired'));

      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required',
        message: 'Session expired'
      });
    });

    it('should handle unknown errors gracefully', async () => {
      mockS3Service.listBuckets.mockRejectedValue('Unknown error');

      const response = await request(app)
        .get('/api/s3/buckets')
        .set('Authorization', `Bearer ${mockSessionToken}`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to list buckets',
        message: 'Unknown error occurred'
      });
    });
  });
});