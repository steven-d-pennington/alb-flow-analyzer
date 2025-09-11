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

describe('S3IntegrationService Integration Tests', () => {
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

  describe('ALB Log File Discovery Workflow', () => {
    it('should discover ALB log files in typical S3 structure', async () => {
      // Mock typical ALB log structure
      const mockObjects = [
        {
          Key: 'alb-logs/AWSLogs/123456789012/elasticloadbalancing/us-east-1/2023/01/01/123456789012_elasticloadbalancing_us-east-1_app.my-loadbalancer.50dc6c495c0c9188_20230101T0000Z_172.30.0.100_2s7k8n9m.log.gz',
          Size: 1024000,
          LastModified: new Date('2023-01-01T00:05:00Z'),
          ETag: '"abc123"',
          StorageClass: 'STANDARD',
        },
        {
          Key: 'alb-logs/AWSLogs/123456789012/elasticloadbalancing/us-east-1/2023/01/01/123456789012_elasticloadbalancing_us-east-1_app.my-loadbalancer.50dc6c495c0c9188_20230101T0100Z_172.30.0.100_3t8l9o0n.log.gz',
          Size: 2048000,
          LastModified: new Date('2023-01-01T01:05:00Z'),
          ETag: '"def456"',
          StorageClass: 'STANDARD',
        },
        {
          Key: 'alb-logs/AWSLogs/123456789012/elasticloadbalancing/us-east-1/2023/01/02/123456789012_elasticloadbalancing_us-east-1_app.my-loadbalancer.50dc6c495c0c9188_20230102T0000Z_172.30.0.100_4u9m0p1o.log.gz',
          Size: 1536000,
          LastModified: new Date('2023-01-02T00:05:00Z'),
          ETag: '"ghi789"',
          StorageClass: 'STANDARD',
        },
        {
          Key: 'other-logs/application.log',
          Size: 512000,
          LastModified: new Date('2023-01-01T12:00:00Z'),
          ETag: '"jkl012"',
          StorageClass: 'STANDARD',
        },
      ];

      mockS3Instance.listObjectsV2.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Contents: mockObjects }),
      });

      const searchCriteria: S3SearchCriteria = {
        prefix: 'alb-logs/',
        fileExtensions: ['.log.gz'],
        recursive: true,
      };

      const result = await service.searchLogFiles('my-alb-logs-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(3);
      expect(result.every(obj => obj.key.includes('elasticloadbalancing'))).toBe(true);
      expect(result.every(obj => obj.key.endsWith('.log.gz'))).toBe(true);
    });

    it('should handle large bucket with pagination during search', async () => {
      // Simulate pagination with large number of objects
      const createMockObjects = (start: number, count: number) => 
        Array.from({ length: count }, (_, i) => ({
          Key: `alb-logs/2023/01/01/log-${start + i}.gz`,
          Size: 1024 * (start + i),
          LastModified: new Date(`2023-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`),
          ETag: `"etag-${start + i}"`,
          StorageClass: 'STANDARD',
        }));

      const batch1 = createMockObjects(1, 1000);
      const batch2 = createMockObjects(1001, 500);

      mockS3Instance.listObjectsV2
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: batch1,
            NextContinuationToken: 'token-page-2',
          }),
        })
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: batch2,
            NextContinuationToken: undefined,
          }),
        });

      const searchCriteria: S3SearchCriteria = {
        prefix: 'alb-logs/',
        recursive: true,
      };

      const result = await service.searchLogFiles('large-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(1500);
      expect(mockS3Instance.listObjectsV2).toHaveBeenCalledTimes(2);
    });
  });

  describe('File Filtering Scenarios', () => {
    const mockLogFiles = [
      {
        Key: 'logs/2023/01/01/app.my-lb.log.gz',
        Size: 1024000, // 1MB
        LastModified: new Date('2023-01-01T10:00:00Z'),
        ETag: '"etag1"',
        StorageClass: 'STANDARD',
      },
      {
        Key: 'logs/2023/01/01/app.my-lb.log',
        Size: 512000, // 512KB
        LastModified: new Date('2023-01-01T11:00:00Z'),
        ETag: '"etag2"',
        StorageClass: 'STANDARD',
      },
      {
        Key: 'logs/2023/01/02/app.my-lb.log.gz',
        Size: 2048000, // 2MB
        LastModified: new Date('2023-01-02T10:00:00Z'),
        ETag: '"etag3"',
        StorageClass: 'STANDARD',
      },
      {
        Key: 'logs/2023/01/03/app.my-lb.log.gz',
        Size: 2097152, // 2MB
        LastModified: new Date('2023-01-03T10:00:00Z'),
        ETag: '"etag4"',
        StorageClass: 'STANDARD',
      },
    ];

    beforeEach(() => {
      mockS3Instance.listObjectsV2.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Contents: mockLogFiles }),
      });
    });

    it('should filter by date range for specific day analysis', async () => {
      const searchCriteria: S3SearchCriteria = {
        dateRange: {
          start: new Date('2023-01-01T00:00:00Z'),
          end: new Date('2023-01-01T23:59:59Z'),
        },
        recursive: false,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(2);
      expect(result.every(obj => obj.lastModified.getDate() === 1)).toBe(true);
    });

    it('should filter by file size for manageable processing', async () => {
      const searchCriteria: S3SearchCriteria = {
        maxSize: 3 * 1024 * 1024, // 3MB max
        recursive: false,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(4); // All files are now under 3MB
      expect(result.every(obj => obj.size <= 3 * 1024 * 1024)).toBe(true);
    });

    it('should combine filters for production log analysis', async () => {
      const searchCriteria: S3SearchCriteria = {
        fileExtensions: ['.gz'], // Only compressed files
        dateRange: {
          start: new Date('2023-01-01T00:00:00Z'),
          end: new Date('2023-01-02T23:59:59Z'),
        },
        maxSize: 3 * 1024 * 1024, // Max 3MB
        recursive: true,
      };

      const result = await service.searchLogFiles('test-bucket', searchCriteria, mockCredentials);

      expect(result).toHaveLength(2);
      expect(result.every(obj => obj.key.endsWith('.gz'))).toBe(true);
      expect(result.every(obj => obj.size <= 3 * 1024 * 1024)).toBe(true);
      expect(result.every(obj => obj.lastModified <= new Date('2023-01-02T23:59:59Z'))).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle partial failures during recursive search', async () => {
      mockS3Instance.listObjectsV2
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: [
              {
                Key: 'logs/batch1/file1.gz',
                Size: 1024,
                LastModified: new Date(),
                ETag: '"etag1"',
                StorageClass: 'STANDARD',
              },
            ],
            NextContinuationToken: 'token-batch2',
          }),
        })
        .mockReturnValueOnce({
          promise: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        });

      const searchCriteria: S3SearchCriteria = {
        recursive: true,
      };

      await expect(service.searchLogFiles('test-bucket', searchCriteria, mockCredentials))
        .rejects.toThrow('Failed to search log files in bucket test-bucket: Rate limit exceeded');
    });

    it('should handle invalid credentials gracefully', async () => {
      mockS3Instance.listBuckets.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('The AWS Access Key Id you provided does not exist in our records')),
      });

      await expect(service.listBuckets(mockCredentials))
        .rejects.toThrow('Failed to list S3 buckets: The AWS Access Key Id you provided does not exist in our records');
    });

    it('should handle network timeouts during large file download', async () => {
      mockS3Instance.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Request timeout')),
      });

      await expect(service.downloadObject('test-bucket', 'large-file.gz', mockCredentials))
        .rejects.toThrow('Failed to download object large-file.gz from bucket test-bucket: Request timeout');
    });
  });

  describe('Performance and Streaming', () => {
    it('should create streaming request for large file downloads', () => {
      const mockRequest = {
        createReadStream: jest.fn(),
        on: jest.fn(),
        abort: jest.fn(),
      };

      mockS3Instance.getObject.mockReturnValue(mockRequest as any);

      const stream = service.createDownloadStream('test-bucket', 'large-log.gz', mockCredentials);

      expect(stream).toBe(mockRequest);
      expect(mockS3Instance.getObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'large-log.gz',
      });
    });

    it('should handle metadata retrieval for file validation', async () => {
      const mockMetadata = {
        ContentLength: 1073741824, // 1GB
        LastModified: new Date('2023-01-01T10:00:00Z'),
        ETag: '"large-file-etag"',
        StorageClass: 'STANDARD',
        ContentType: 'application/gzip',
        ContentEncoding: 'gzip',
        Metadata: {
          'log-type': 'alb-access-log',
          'source-lb': 'my-load-balancer',
        },
      };

      mockS3Instance.headObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockMetadata),
      });

      const result = await service.getObjectMetadata('test-bucket', 'large-log.gz', mockCredentials);

      expect(result.size).toBe(1073741824);
      expect(result.contentType).toBe('application/gzip');
      expect(result.metadata).toEqual({
        'log-type': 'alb-access-log',
        'source-lb': 'my-load-balancer',
      });
    });
  });
});