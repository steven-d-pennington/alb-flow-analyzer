# DataStore - Data Access Layer

The DataStore provides a repository pattern implementation for managing ALB flow log entries with efficient querying, filtering, and batch operations.

## Overview

The DataStore is designed to handle large volumes of ALB flow log data with the following key features:

- **Batch Operations**: Efficient bulk insert operations for processing large log files
- **Flexible Filtering**: Support for complex filtering by time range, endpoints, status codes, client IPs, and user agent patterns
- **Index Management**: Dynamic index creation and management for query optimization
- **Statistics**: Comprehensive database statistics and monitoring
- **Data Management**: Cleanup and maintenance operations

## Architecture

```
DataStore Interface
├── SqliteDataStore (Implementation)
├── ConnectionPool (Database connections)
└── FilterCriteria (Query filtering)
```

## Core Interfaces

### DataStore Interface

```typescript
interface DataStore {
  // Core data operations
  store(entries: ParsedLogEntry[]): Promise<BatchInsertResult>;
  query(filters?: FilterCriteria): Promise<ParsedLogEntry[]>;
  count(filters?: FilterCriteria): Promise<number>;
  
  // Index management
  createIndex(field: string): Promise<void>;
  dropIndex(indexName: string): Promise<void>;
  listIndexes(): Promise<string[]>;
  
  // Statistics and monitoring
  getStats(): Promise<StorageStats>;
  getDatabaseSize(): Promise<number>;
  
  // Data management
  clearData(): Promise<void>;
  deleteOldEntries(olderThan: Date): Promise<number>;
  
  // Connection management
  close(): Promise<void>;
}
```

### Data Models

#### ParsedLogEntry
Represents a parsed ALB flow log entry with all standard fields:

```typescript
interface ParsedLogEntry {
  id?: number;
  timestamp: Date;
  clientIp: string;
  targetIp: string;
  requestProcessingTime: number;
  targetProcessingTime: number;
  responseProcessingTime: number;
  elbStatusCode: number;
  targetStatusCode: number;
  receivedBytes: number;
  sentBytes: number;
  requestVerb: string;
  requestUrl: string;
  requestProtocol: string;
  userAgent: string;
  sslCipher?: string;
  sslProtocol?: string;
  targetGroupArn: string;
  traceId: string;
  domainName: string;
  chosenCertArn?: string;
  matchedRulePriority: number;
  requestCreationTime: Date;
  actionsExecuted: string;
  redirectUrl?: string;
  errorReason?: string;
  targetPortList: string;
  targetStatusCodeList: string;
  classification: string;
  classificationReason: string;
  createdAt?: Date;
}
```

#### FilterCriteria
Defines filtering options for queries:

```typescript
interface FilterCriteria {
  timeRange?: {
    start: Date;
    end: Date;
  };
  endpoints?: string[];
  statusCodes?: number[];
  clientIps?: string[];
  userAgentPatterns?: string[];
  domainNames?: string[];
  limit?: number;
  offset?: number;
}
```

## Usage Examples

### Basic Usage

```typescript
import { ConnectionFactory } from './ConnectionFactory';
import { createDataStore } from './DataStore';

// Create connection pool
const factory = ConnectionFactory.getInstance();
const pool = await factory.createPool({
  type: 'sqlite',
  database: './logs.db'
});

// Create DataStore
const dataStore = await createDataStore(pool);

// Store entries
const entries = [/* parsed log entries */];
const result = await dataStore.store(entries);
console.log(`Stored ${result.insertedCount} entries`);

// Query with filters
const errorEntries = await dataStore.query({
  statusCodes: [404, 500],
  timeRange: {
    start: new Date('2024-01-01T00:00:00Z'),
    end: new Date('2024-01-01T23:59:59Z')
  }
});
```

### Advanced Filtering

```typescript
// Complex filtering example
const complexFilter = {
  timeRange: {
    start: new Date('2024-01-01T10:00:00Z'),
    end: new Date('2024-01-01T11:00:00Z')
  },
  statusCodes: [200, 201, 202],
  endpoints: ['/api/users', '/api/orders'],
  clientIps: ['192.168.1.100', '192.168.1.101'],
  userAgentPatterns: ['Mozilla', 'Chrome'],
  limit: 100,
  offset: 0
};

const filteredEntries = await dataStore.query(complexFilter);
```

### Index Management

```typescript
// Create indexes for better query performance
await dataStore.createIndex('user_agent');
await dataStore.createIndex('domain_name');

// List all indexes
const indexes = await dataStore.listIndexes();
console.log('Available indexes:', indexes);

// Drop an index
await dataStore.dropIndex('idx_log_entries_user_agent');
```

### Statistics and Monitoring

```typescript
// Get comprehensive database statistics
const stats = await dataStore.getStats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Database size: ${stats.databaseSize} bytes`);
console.log(`Date range: ${stats.oldestEntry} to ${stats.newestEntry}`);
console.log(`Indexes: ${stats.indexCount}`);

// Get just the database size
const size = await dataStore.getDatabaseSize();
console.log(`Database size: ${size} bytes`);
```

### Data Management

```typescript
// Count entries with filters
const totalCount = await dataStore.count();
const errorCount = await dataStore.count({ statusCodes: [404, 500] });

// Delete old entries (cleanup)
const deletedCount = await dataStore.deleteOldEntries(
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
);

// Clear all data
await dataStore.clearData();
```

## Performance Considerations

### Indexing Strategy

The DataStore automatically creates indexes on commonly queried fields:

- `timestamp` - For time-range queries
- `request_url` - For endpoint filtering
- `elb_status_code` - For status code filtering
- `client_ip` - For client IP filtering
- `domain_name` - For domain-based filtering

Additional composite indexes:
- `(timestamp, elb_status_code)` - For time + status queries
- `(timestamp, request_url)` - For time + endpoint queries

### Batch Operations

For optimal performance when inserting large datasets:

```typescript
// Process in batches of 1000-5000 entries
const batchSize = 1000;
for (let i = 0; i < allEntries.length; i += batchSize) {
  const batch = allEntries.slice(i, i + batchSize);
  const result = await dataStore.store(batch);
  console.log(`Batch ${i/batchSize + 1}: ${result.insertedCount} inserted`);
}
```

### Query Optimization

- Use specific filters to reduce result sets
- Leverage indexes by filtering on indexed fields first
- Use `count()` instead of `query().length` for counting
- Apply `limit` and `offset` for pagination

## Error Handling

The DataStore provides detailed error information:

```typescript
try {
  const result = await dataStore.store(entries);
  if (result.failedCount > 0) {
    console.log('Some entries failed:', result.errors);
  }
} catch (error) {
  if (error instanceof QueryError) {
    console.error('Query failed:', error.message, error.query);
  } else if (error instanceof ConnectionError) {
    console.error('Connection failed:', error.message);
  }
}
```

## Testing

The DataStore includes comprehensive unit tests covering:

- Batch insert operations
- Complex filtering scenarios
- Index management
- Statistics calculation
- Data cleanup operations
- Error handling

Run tests with:
```bash
npm test -- --testPathPattern=DataStore.test.ts
```

## Requirements Mapping

This implementation satisfies the following requirements:

- **1.1**: Parse ALB flow logs - Data model supports all ALB flow log fields
- **4.1**: Date/time range filtering - `timeRange` filter support
- **4.2**: Endpoint filtering - `endpoints` filter support
- **4.3**: Status code filtering - `statusCodes` filter support
- **4.4**: Client IP filtering - `clientIps` filter support
- **4.5**: User agent filtering - `userAgentPatterns` filter support
- **4.6**: Filter combination - All filters can be combined in a single query

## Future Enhancements

- Support for additional database backends (PostgreSQL, ClickHouse, DuckDB)
- Query result caching for frequently accessed data
- Streaming query results for very large datasets
- Automatic index recommendations based on query patterns
- Data compression and archival features