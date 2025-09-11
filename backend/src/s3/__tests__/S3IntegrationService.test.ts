import AWS from 'aws-sdk';
import { S3IntegrationService } from '../S3IntegrationService';
import { AWSCredentials } from '../../auth/types';
import { S3SearchCriteria } from '../types';

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => ({
    listBuckets: jest.fn(),
    listObjectsV2: jest.fn(),
    getObject: jest.fn(),
    headObject: jest.fn(),
  })),
}));

const mockS3Instance = {
  listBuckets: jest.fn(),
  listObjectsV2: jest.fn(),
  getObject: jest.fn(),
  headObject: jest.fn(),
};

// Get the mocked constructor
const MockedS3 = AWS.S3 as jest.MockedClass<typeof AWS.S3>;

describe('S3IntegrationService', () => {
  let service: S3IntegrationService;
  let mockCredentials: AWSCredentials;

  beforeEach(() => {
    service = new S3IntegrationService();
    mockCredentials = {
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      region: 'us-east-1',
    };

    // Reset the S3 constructor mock to return our mock instance
    MockedS3.mockImplementation(() => mockS3Instance as any);
    
    // Reset individual method mocks
    mockS3Instance.listBuckets.mockReset();
    mockS3Instance.listObjectsV2.mockReset();
    mockS3Instance.getObject.mockReset();
    mockS3Instance.headObject.mockReset();
  });

  describe('listBuckets', () => {
    it('should list all S3 buckets', async () => {
      const mockBuckets = [
        { Name: 'bucket1', CreationDate: new Date('2023-01-01') },
        { Name: 'bucket2', CreationDate: new Date('2023-02-01') },
      ];

      mockS3Instance.listBuckets.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Buckets: mockBuckets }),
      });

      const result = await service.listBuckets(mockCredentials);

      expect(result).toEqual([
        { name: 'bucket1', creationDate: new Date('2023-01-01') },
        { name: 'bucket2', creationDate: new Date('2023-02-01') },
      ]);
      expect(mockS3Instance.listBuckets).toHaveBeenCalledTimes(1);
    });

    it('should handle empty bucket list', async () => {
      mockS3Instance.listBuckets.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Buckets: [] }),
      });

      const result = await service.listBuckets(mockCredentials);

      expect(result).toEqual([]);
    });

    it('should throw error when listBuckets fails', async () => {
      mockS3Instance.listBuckets.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Access denied')),
      });

      await expect(service.listBuckets(mockCredentials)).rejects.toThrow(
        'Failed to list S3 buckets: Access denied'
      );
    });
  });

  describe('listObjects', () => {
    it('should list objects with pagination', async () => {
      const mockObjects1 = [
        {
          Key: 'logs/2023/01/01/log1.gz',
          Size: 1024,
          LastModified: new Date('2023-01-01'),
          ETag: '"etag1"',
          StorageClass: 'STANDARD',
        },
      ];

      const mockObjects2 = [
        {
          Key: 'logs/2023/01/01/log2.gz',
          Size: 2048,
          LastModified: new Date('2023-01-01'),
          ETag: '"etag2"',
          StorageClass: 'STANDARD',
        },
      ];

      mockS3Instance.listObjectsV2
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: mockObjects1,
            NextContinuationToken: 'token123',
          }),
        })
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: mockObjects2,
            NextContinuationToken: undefined,
          }),
        });

      const result = await service.listObjects('test-bucket', 'logs/', mockCredentials);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'logs/2023/01/01/log1.gz',
        size: 1024,
        lastModified: new Date('2023-01-01'),
        etag: '"etag1"',
        storageClass: 'STANDARD',
      });
      expect(mockS3Instance.listObjectsV2).toHaveBeenCalledTimes(2);
    });

    it('should handle empty object list', async () => {
      mockS3Instance.listObjectsV2.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Contents: [] }),
      });

      const result = await service.listObjects('test-bucket', 'logs/', mockCredentials);

      expect(result).toEqual([]);
    });

    it('should throw error when listObjects fails', async () => {
      mockS3Instance.listObjectsV2.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Bucket not found')),
      });

      await expect(service.listObjects('test-bucket', 'logs/', mockCredentials)).rejects.toThrow(
        'Failed to list objects in bucket test-bucket: Bucket not found'
      );
    });
  });

  describe('searchLogFiles', () => {
    const mockObjects = [
      {
        Key: 'logs/2023/01/01/access.log.gz',
        Size: 1024,
        LastModified: new Date('2023-01-01T10:00:00Z'),
        ETag: '"etag1"',
        StorageClass: 'STANDARD',
      },
      {
        Key: 'logs/2023/01/01/error.log',
        Size: 512,
        LastModified: new Date('2023-01-01T11:00:00Z'),
        ETag: '"etag2"',
        StorageClass: 'STANDARD',
      },
      {
        Key: 'logs/2023/01/02/access.log.gz',
        Size: 2048,
        LastModified: new Date('2023-01-02T10:00:00Z'),
        ETag: '"etag3"',
        StorageClass: 'STANDARD',
      },
    ];

    beforeEach(() => {
      mockS3Instance.listObjectsV2.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Contents: mockObjects }),
      });
    });

    it('should search with file extension filter', async () => {
      const searchCriteria: S3SearchCriteria = {
        fileExtensions: ['.gz'],
        recursive: false,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(2);
      expect(result.every(obj => obj.key.endsWith('.gz'))).toBe(true);
    });

    it('should search with date range filter', async () => {
      const searchCriteria: S3SearchCriteria = {
        dateRange: {
          start: new Date('2023-01-01T10:30:00Z'),
          end: new Date('2023-01-01T23:59:59Z'),
        },
        recursive: false,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('logs/2023/01/01/error.log');
    });

    it('should search with size filter', async () => {
      const searchCriteria: S3SearchCriteria = {
        maxSize: 1000,
        recursive: false,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(512);
    });

    it('should combine multiple filters', async () => {
      const searchCriteria: S3SearchCriteria = {
        fileExtensions: ['.gz'],
        maxSize: 1500,
        recursive: false,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('logs/2023/01/01/access.log.gz');
    });

    it('should handle recursive search', async () => {
      const searchCriteria: S3SearchCriteria = {
        prefix: 'logs/',
        recursive: true,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(3);
      expect(mockS3Instance.listObjectsV2).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Prefix: 'logs/',
        ContinuationToken: undefined,
      });
    });
  });

  describe('downloadObject', () => {
    it('should download object as buffer', async () => {
      const mockBuffer = Buffer.from('log file content');
      
      mockS3Instance.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Body: mockBuffer }),
      });

      const result = await service.downloadObject('test-bucket', 'logs/test.log', mockCredentials);

      expect(result).toEqual(mockBuffer);
      expect(mockS3Instance.getObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'logs/test.log',
      });
    });

    it('should throw error when object has no body', async () => {
      mockS3Instance.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Body: undefined }),
      });

      await expect(service.downloadObject('test-bucket', 'logs/test.log', mockCredentials)).rejects.toThrow(
        'Object logs/test.log has no body'
      );
    });

    it('should throw error when download fails', async () => {
      mockS3Instance.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Object not found')),
      });

      await expect(service.downloadObject('test-bucket', 'logs/test.log', mockCredentials)).rejects.toThrow(
        'Failed to download object logs/test.log from bucket test-bucket: Object not found'
      );
    });
  });

  describe('getObjectMetadata', () => {
    it('should get object metadata', async () => {
      const mockMetadata = {
        ContentLength: 1024,
        LastModified: new Date('2023-01-01'),
        ETag: '"etag1"',
        StorageClass: 'STANDARD',
        ContentType: 'application/gzip',
        Metadata: { 'custom-key': 'custom-value' },
      };

      mockS3Instance.headObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockMetadata),
      });

      const result = await service.getObjectMetadata('test-bucket', 'logs/test.log', mockCredentials);

      expect(result).toEqual({
        key: 'logs/test.log',
        size: 1024,
        lastModified: new Date('2023-01-01'),
        etag: '"etag1"',
        storageClass: 'STANDARD',
        contentType: 'application/gzip',
        metadata: { 'custom-key': 'custom-value' },
      });
    });

    it('should throw error when metadata retrieval fails', async () => {
      mockS3Instance.headObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Object not found')),
      });

      await expect(service.getObjectMetadata('test-bucket', 'logs/test.log', mockCredentials)).rejects.toThrow(
        'Failed to get metadata for object logs/test.log in bucket test-bucket: Object not found'
      );
    });
  });

  describe('createDownloadStream', () => {
    it('should create download stream', () => {
      const mockRequest = { createReadStream: jest.fn() };
      mockS3Instance.getObject.mockReturnValue(mockRequest as any);

      const result = service.createDownloadStream('test-bucket', 'logs/test.log', mockCredentials);

      expect(result).toBe(mockRequest);
      expect(mockS3Instance.getObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'logs/test.log',
      });
    });
  });

  describe('S3 client creation', () => {
    it('should create S3 client with session token', async () => {
      const credentialsWithToken = {
        ...mockCredentials,
        sessionToken: 'test-session-token',
      };

      // Mock the listBuckets method to avoid actual call
      mockS3Instance.listBuckets.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Buckets: [] }),
      });

      await service.listBuckets(credentialsWithToken);

      expect(AWS.S3).toHaveBeenCalledWith({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
        region: 'us-east-1',
      });
    });

    it('should create S3 client without session token', async () => {
      // Mock the listBuckets method to avoid actual call
      mockS3Instance.listBuckets.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Buckets: [] }),
      });

      await service.listBuckets(mockCredentials);

      expect(AWS.S3).toHaveBeenCalledWith({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: undefined,
        region: 'us-east-1',
      });
    });
  });
});