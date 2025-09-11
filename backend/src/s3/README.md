# S3 Integration Service

The S3 Integration Service provides comprehensive functionality for browsing, searching, and downloading AWS Application Load Balancer (ALB) flow logs from S3 buckets.

## Features

- **Bucket Browsing**: List all accessible S3 buckets
- **Object Listing**: List objects with pagination support
- **Recursive Search**: Search through bucket hierarchies with filtering
- **File Filtering**: Filter by extension, date range, and file size
- **Efficient Downloads**: Support for both buffer downloads and streaming
- **Metadata Retrieval**: Get detailed object metadata

## Usage

### Basic Setup

```typescript
import { S3IntegrationService } from './S3IntegrationService';
import { AWSCredentials } from '../auth/types';

const s3Service = new S3IntegrationService();

const credentials: AWSCredentials = {
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  region: 'us-east-1',
  sessionToken: 'optional-session-token'
};
```

### List Buckets

```typescript
const buckets = await s3Service.listBuckets(credentials);
console.log('Available buckets:', buckets);
```

### Search for ALB Log Files

```typescript
import { S3SearchCriteria } from './types';

const searchCriteria: S3SearchCriteria = {
  prefix: 'alb-logs/',
  fileExtensions: ['.log.gz'],
  dateRange: {
    start: new Date('2023-01-01'),
    end: new Date('2023-01-31')
  },
  maxSize: 10 * 1024 * 1024, // 10MB max
  recursive: true
};

const logFiles = await s3Service.searchLogFiles('my-bucket', searchCriteria, credentials);
```

### Download Files

```typescript
// Download as buffer (for smaller files)
const fileBuffer = await s3Service.downloadObject('my-bucket', 'logs/file.gz', credentials);

// Create stream for large files
const downloadStream = s3Service.createDownloadStream('my-bucket', 'logs/large-file.gz', credentials);
const readStream = downloadStream.createReadStream();
```

### Get File Metadata

```typescript
const metadata = await s3Service.getObjectMetadata('my-bucket', 'logs/file.gz', credentials);
console.log('File size:', metadata.size);
console.log('Last modified:', metadata.lastModified);
```

## Search Criteria Options

### File Extensions
Filter by specific file extensions:
```typescript
fileExtensions: ['.log.gz', '.log', '.txt']
```

### Date Range
Filter by modification date:
```typescript
dateRange: {
  start: new Date('2023-01-01T00:00:00Z'),
  end: new Date('2023-01-31T23:59:59Z')
}
```

### File Size
Filter by maximum file size (in bytes):
```typescript
maxSize: 5 * 1024 * 1024 // 5MB maximum
```

### Recursive Search
Enable recursive search through subdirectories:
```typescript
recursive: true
```

## ALB Log File Patterns

The service is optimized for AWS ALB log file patterns:

```
bucket/
├── AWSLogs/
│   └── 123456789012/
│       └── elasticloadbalancing/
│           └── us-east-1/
│               └── 2023/
│                   └── 01/
│                       └── 01/
│                           ├── 123456789012_elasticloadbalancing_us-east-1_app.my-lb.50dc6c495c0c9188_20230101T0000Z_172.30.0.100_2s7k8n9m.log.gz
│                           └── 123456789012_elasticloadbalancing_us-east-1_app.my-lb.50dc6c495c0c9188_20230101T0100Z_172.30.0.100_3t8l9o0n.log.gz
```

## Error Handling

The service provides comprehensive error handling:

- **Authentication Errors**: Invalid credentials or permissions
- **Network Errors**: Timeouts, connection issues
- **S3 Errors**: Bucket not found, object not found
- **Rate Limiting**: AWS API throttling

All errors are wrapped with descriptive messages indicating the operation that failed.

## Performance Considerations

### Large Buckets
- Uses pagination to handle buckets with millions of objects
- Supports continuation tokens for efficient traversal

### Large Files
- Provides streaming interface for files larger than available memory
- Buffer downloads for smaller files that fit in memory

### Filtering
- Client-side filtering after S3 API calls
- Efficient for common use cases but may require optimization for very large result sets

## Testing

The service includes comprehensive tests:

```bash
# Run unit tests
npm test src/s3/__tests__/S3IntegrationService.test.ts

# Run integration tests
npm test src/s3/__tests__/integration.test.ts
```

## Dependencies

- `aws-sdk`: AWS SDK for JavaScript
- `@types/aws-sdk`: TypeScript definitions for AWS SDK

## Security Notes

- Credentials are never stored persistently
- All S3 operations use the provided credentials directly
- Session tokens are supported for temporary credentials
- No credential caching or persistence in this service layer