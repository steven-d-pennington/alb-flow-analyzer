/**
 * Example usage of DataStore for ALB flow log analysis
 */

import { ConnectionFactory } from '../ConnectionFactory';
import { DatabaseSchemaManager } from '../schema';
import { createDataStore, ParsedLogEntry, FilterCriteria } from '../DataStore';
import { DatabaseConfig } from '../types';

async function dataStoreExample() {
  // 1. Set up database connection
  const config: DatabaseConfig = {
    type: 'sqlite',
    database: './alb_logs.db'
  };

  const factory = ConnectionFactory.getInstance();
  const connectionPool = await factory.createPool(config);

  // 2. Initialize database schema
  const connection = await connectionPool.acquire();
  const schemaManager = new DatabaseSchemaManager(connection);
  await schemaManager.initializeSchema();
  await connectionPool.release(connection);

  // 3. Create DataStore instance
  const dataStore = await createDataStore(connectionPool);

  try {
    // 4. Store sample ALB flow log entries
    const sampleEntries: ParsedLogEntry[] = [
      {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        clientIp: '192.168.1.100',
        targetIp: '10.0.1.100',
        requestProcessingTime: 0.001,
        targetProcessingTime: 0.002,
        responseProcessingTime: 0.001,
        elbStatusCode: 200,
        targetStatusCode: 200,
        receivedBytes: 1024,
        sentBytes: 2048,
        requestVerb: 'GET',
        requestUrl: '/api/users',
        requestProtocol: 'HTTP/1.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        sslCipher: 'ECDHE-RSA-AES128-GCM-SHA256',
        sslProtocol: 'TLSv1.2',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/api-targets/1234567890123456',
        traceId: 'Root=1-5e1b4151-5ac6c58f5b5daa6532e4f2e1',
        domainName: 'api.example.com',
        chosenCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
        matchedRulePriority: 1,
        requestCreationTime: new Date('2024-01-01T09:59:59Z'),
        actionsExecuted: 'forward',
        targetPortList: '80',
        targetStatusCodeList: '200',
        classification: 'Normal',
        classificationReason: 'Normal request processing'
      },
      {
        timestamp: new Date('2024-01-01T10:01:00Z'),
        clientIp: '192.168.1.101',
        targetIp: '10.0.1.101',
        requestProcessingTime: 0.005,
        targetProcessingTime: 0.010,
        responseProcessingTime: 0.002,
        elbStatusCode: 404,
        targetStatusCode: 404,
        receivedBytes: 512,
        sentBytes: 1024,
        requestVerb: 'GET',
        requestUrl: '/api/nonexistent',
        requestProtocol: 'HTTP/1.1',
        userAgent: 'curl/7.68.0',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/api-targets/1234567890123456',
        traceId: 'Root=1-5e1b4152-6bd7d69f6c6eaa7643f5g3f2',
        domainName: 'api.example.com',
        matchedRulePriority: 1,
        requestCreationTime: new Date('2024-01-01T10:00:59Z'),
        actionsExecuted: 'forward',
        targetPortList: '80',
        targetStatusCodeList: '404',
        classification: 'ClientError',
        classificationReason: 'Resource not found'
      },
      {
        timestamp: new Date('2024-01-01T10:02:00Z'),
        clientIp: '192.168.1.102',
        targetIp: '10.0.1.102',
        requestProcessingTime: 0.002,
        targetProcessingTime: 0.050,
        responseProcessingTime: 0.003,
        elbStatusCode: 500,
        targetStatusCode: 500,
        receivedBytes: 2048,
        sentBytes: 512,
        requestVerb: 'POST',
        requestUrl: '/api/orders',
        requestProtocol: 'HTTP/1.1',
        userAgent: 'PostmanRuntime/7.26.8',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/api-targets/1234567890123456',
        traceId: 'Root=1-5e1b4153-7ce8e7af7d7fbb8754g6h4g3',
        domainName: 'api.example.com',
        matchedRulePriority: 2,
        requestCreationTime: new Date('2024-01-01T10:01:59Z'),
        actionsExecuted: 'forward',
        errorReason: 'TargetFailure',
        targetPortList: '80',
        targetStatusCodeList: '500',
        classification: 'ServerError',
        classificationReason: 'Internal server error'
      }
    ];

    console.log('Storing sample entries...');
    const storeResult = await dataStore.store(sampleEntries);
    console.log(`Stored ${storeResult.insertedCount} entries, ${storeResult.failedCount} failed`);

    // 5. Query all entries
    console.log('\nQuerying all entries:');
    const allEntries = await dataStore.query();
    console.log(`Found ${allEntries.length} total entries`);

    // 6. Filter by status codes
    console.log('\nFiltering by error status codes (4xx, 5xx):');
    const errorFilter: FilterCriteria = {
      statusCodes: [404, 500]
    };
    const errorEntries = await dataStore.query(errorFilter);
    console.log(`Found ${errorEntries.length} error entries`);
    errorEntries.forEach(entry => {
      console.log(`  - ${entry.timestamp.toISOString()}: ${entry.requestVerb} ${entry.requestUrl} -> ${entry.elbStatusCode}`);
    });

    // 7. Filter by time range
    console.log('\nFiltering by time range (last minute):');
    const timeFilter: FilterCriteria = {
      timeRange: {
        start: new Date('2024-01-01T10:01:30Z'),
        end: new Date('2024-01-01T10:02:30Z')
      }
    };
    const recentEntries = await dataStore.query(timeFilter);
    console.log(`Found ${recentEntries.length} entries in time range`);

    // 8. Filter by client IP
    console.log('\nFiltering by specific client IP:');
    const clientFilter: FilterCriteria = {
      clientIps: ['192.168.1.100']
    };
    const clientEntries = await dataStore.query(clientFilter);
    console.log(`Found ${clientEntries.length} entries from client 192.168.1.100`);

    // 9. Complex filtering (combine multiple criteria)
    console.log('\nComplex filtering (GET requests with 200 status):');
    const complexFilter: FilterCriteria = {
      statusCodes: [200],
      endpoints: ['/api/users']
    };
    const filteredEntries = await dataStore.query(complexFilter);
    console.log(`Found ${filteredEntries.length} successful GET /api/users requests`);

    // 10. Get database statistics
    console.log('\nDatabase statistics:');
    const stats = await dataStore.getStats();
    console.log(`  Total entries: ${stats.totalEntries}`);
    console.log(`  Database size: ${stats.databaseSize} bytes`);
    console.log(`  Oldest entry: ${stats.oldestEntry?.toISOString()}`);
    console.log(`  Newest entry: ${stats.newestEntry?.toISOString()}`);
    console.log(`  Index count: ${stats.indexCount}`);

    // 11. Create custom index for performance
    console.log('\nCreating custom index on user_agent...');
    await dataStore.createIndex('user_agent');
    
    const indexes = await dataStore.listIndexes();
    console.log(`Available indexes: ${indexes.join(', ')}`);

    // 12. Count entries with different filters
    console.log('\nCounting entries:');
    const totalCount = await dataStore.count();
    const errorCount = await dataStore.count({ statusCodes: [404, 500] });
    const successCount = await dataStore.count({ statusCodes: [200] });
    
    console.log(`  Total: ${totalCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Success: ${successCount}`);

    // 13. Pagination example
    console.log('\nPagination example (limit 2, offset 1):');
    const paginatedEntries = await dataStore.query({
      limit: 2,
      offset: 1
    });
    console.log(`Retrieved ${paginatedEntries.length} entries with pagination`);

    // 14. User agent pattern filtering
    console.log('\nFiltering by user agent patterns:');
    const userAgentFilter: FilterCriteria = {
      userAgentPatterns: ['Mozilla', 'curl']
    };
    const userAgentEntries = await dataStore.query(userAgentFilter);
    console.log(`Found ${userAgentEntries.length} entries matching user agent patterns`);

  } catch (error) {
    console.error('Error during DataStore operations:', error);
  } finally {
    // 15. Clean up
    await dataStore.close();
    console.log('\nDataStore closed successfully');
  }
}

// Run the example
if (require.main === module) {
  dataStoreExample().catch(console.error);
}

export { dataStoreExample };