/**
 * Unit tests for DataStore implementation
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { DataStore, SqliteDataStore, ParsedLogEntry, FilterCriteria, createDataStore } from '../DataStore';
import { ConnectionFactory } from '../ConnectionFactory';
import { DatabaseConfig, ConnectionPool } from '../types';
import { DatabaseSchemaManager } from '../schema';

describe('DataStore', () => {
  let dataStore: DataStore;
  let connectionPool: ConnectionPool;
  let config: DatabaseConfig;

  beforeAll(async () => {
    // Use in-memory SQLite for testing
    config = {
      type: 'sqlite',
      database: ':memory:'
    };

    const factory = ConnectionFactory.getInstance();
    connectionPool = await factory.createPool(config);

    // Initialize schema
    const connection = await connectionPool.acquire();
    const schemaManager = new DatabaseSchemaManager(connection);
    await schemaManager.initializeSchema();
    await connectionPool.release(connection);
  });

  beforeEach(async () => {
    dataStore = await createDataStore(connectionPool);
    // Clear data before each test
    await dataStore.clearData();
  });

  afterEach(async () => {
    // Clean up after each test
    await dataStore.clearData();
  });

  afterAll(async () => {
    await dataStore.close();
  });

  describe('store', () => {
    it('should store single log entry successfully', async () => {
      const entry: ParsedLogEntry = createTestLogEntry();

      const result = await dataStore.store([entry]);

      expect(result.insertedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should store multiple log entries in batch', async () => {
      const entries: ParsedLogEntry[] = [
        createTestLogEntry({ clientIp: '192.168.1.1' }),
        createTestLogEntry({ clientIp: '192.168.1.2' }),
        createTestLogEntry({ clientIp: '192.168.1.3' })
      ];

      const result = await dataStore.store(entries);

      expect(result.insertedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty array gracefully', async () => {
      const result = await dataStore.store([]);

      expect(result.insertedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle entries with optional fields', async () => {
      const entry: ParsedLogEntry = createTestLogEntry({
        sslCipher: undefined,
        sslProtocol: undefined,
        chosenCertArn: undefined,
        redirectUrl: undefined,
        errorReason: undefined
      });

      const result = await dataStore.store([entry]);

      expect(result.insertedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Insert test data
      const entries: ParsedLogEntry[] = [
        createTestLogEntry({
          timestamp: new Date('2024-01-01T10:00:00Z'),
          clientIp: '192.168.1.1',
          requestUrl: '/api/users',
          elbStatusCode: 200
        }),
        createTestLogEntry({
          timestamp: new Date('2024-01-01T11:00:00Z'),
          clientIp: '192.168.1.2',
          requestUrl: '/api/orders',
          elbStatusCode: 404
        }),
        createTestLogEntry({
          timestamp: new Date('2024-01-01T12:00:00Z'),
          clientIp: '192.168.1.1',
          requestUrl: '/api/users',
          elbStatusCode: 500
        })
      ];

      await dataStore.store(entries);
    });

    it('should query all entries without filters', async () => {
      const results = await dataStore.query();

      expect(results).toHaveLength(3);
      expect(results[0].timestamp).toEqual(new Date('2024-01-01T12:00:00Z')); // Most recent first
    });

    it('should filter by time range', async () => {
      const filters: FilterCriteria = {
        timeRange: {
          start: new Date('2024-01-01T10:30:00Z'),
          end: new Date('2024-01-01T11:30:00Z')
        }
      };

      const results = await dataStore.query(filters);

      expect(results).toHaveLength(1);
      expect(results[0].clientIp).toBe('192.168.1.2');
    });

    it('should filter by endpoints', async () => {
      const filters: FilterCriteria = {
        endpoints: ['/api/users']
      };

      const results = await dataStore.query(filters);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.requestUrl).toBe('/api/users');
      });
    });

    it('should filter by status codes', async () => {
      const filters: FilterCriteria = {
        statusCodes: [200, 404]
      };

      const results = await dataStore.query(filters);

      expect(results).toHaveLength(2);
      expect(results.some(r => r.elbStatusCode === 200)).toBe(true);
      expect(results.some(r => r.elbStatusCode === 404)).toBe(true);
    });

    it('should filter by client IPs', async () => {
      const filters: FilterCriteria = {
        clientIps: ['192.168.1.1']
      };

      const results = await dataStore.query(filters);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.clientIp).toBe('192.168.1.1');
      });
    });

    it('should combine multiple filters', async () => {
      const filters: FilterCriteria = {
        clientIps: ['192.168.1.1'],
        statusCodes: [200]
      };

      const results = await dataStore.query(filters);

      expect(results).toHaveLength(1);
      expect(results[0].clientIp).toBe('192.168.1.1');
      expect(results[0].elbStatusCode).toBe(200);
    });

    it('should apply limit and offset', async () => {
      const filters: FilterCriteria = {
        limit: 2,
        offset: 1
      };

      const results = await dataStore.query(filters);

      expect(results).toHaveLength(2);
    });

    it('should filter by user agent patterns', async () => {
      // First, add entries with different user agents
      const entries: ParsedLogEntry[] = [
        createTestLogEntry({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }),
        createTestLogEntry({ userAgent: 'curl/7.68.0' })
      ];
      await dataStore.store(entries);

      const filters: FilterCriteria = {
        userAgentPatterns: ['Mozilla']
      };

      const results = await dataStore.query(filters);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.userAgent.includes('Mozilla'))).toBe(true);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const entries: ParsedLogEntry[] = [
        createTestLogEntry({ elbStatusCode: 200 }),
        createTestLogEntry({ elbStatusCode: 404 }),
        createTestLogEntry({ elbStatusCode: 500 })
      ];

      await dataStore.store(entries);
    });

    it('should count all entries without filters', async () => {
      const count = await dataStore.count();
      expect(count).toBe(3);
    });

    it('should count entries with filters', async () => {
      const filters: FilterCriteria = {
        statusCodes: [200, 404]
      };

      const count = await dataStore.count(filters);
      expect(count).toBe(2);
    });
  });

  describe('index management', () => {
    it('should create index successfully', async () => {
      await dataStore.createIndex('client_ip');

      const indexes = await dataStore.listIndexes();
      expect(indexes).toContain('idx_log_entries_client_ip');
    });

    it('should list existing indexes', async () => {
      const indexes = await dataStore.listIndexes();

      // Should include indexes created by migration
      expect(indexes).toContain('idx_log_entries_timestamp');
      expect(indexes).toContain('idx_log_entries_request_url');
      expect(indexes).toContain('idx_log_entries_elb_status_code');
    });

    it('should drop index successfully', async () => {
      await dataStore.createIndex('user_agent');
      let indexes = await dataStore.listIndexes();
      expect(indexes).toContain('idx_log_entries_user_agent');

      await dataStore.dropIndex('idx_log_entries_user_agent');
      indexes = await dataStore.listIndexes();
      expect(indexes).not.toContain('idx_log_entries_user_agent');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      const entries: ParsedLogEntry[] = [
        createTestLogEntry({ timestamp: new Date('2024-01-01T10:00:00Z') }),
        createTestLogEntry({ timestamp: new Date('2024-01-01T11:00:00Z') }),
        createTestLogEntry({ timestamp: new Date('2024-01-01T12:00:00Z') })
      ];

      await dataStore.store(entries);
    });

    it('should get database statistics', async () => {
      const stats = await dataStore.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.databaseSize).toBeGreaterThan(0);
      expect(stats.oldestEntry).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(stats.newestEntry).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(stats.indexCount).toBeGreaterThan(0);
    });

    it('should get database size', async () => {
      const size = await dataStore.getDatabaseSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should handle empty database statistics', async () => {
      await dataStore.clearData();

      const stats = await dataStore.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });

  describe('data management', () => {
    beforeEach(async () => {
      const entries: ParsedLogEntry[] = [
        createTestLogEntry({ timestamp: new Date('2024-01-01T10:00:00Z') }),
        createTestLogEntry({ timestamp: new Date('2024-01-02T10:00:00Z') }),
        createTestLogEntry({ timestamp: new Date('2024-01-03T10:00:00Z') })
      ];

      await dataStore.store(entries);
    });

    it('should clear all data', async () => {
      await dataStore.clearData();

      const count = await dataStore.count();
      expect(count).toBe(0);
    });

    it('should delete old entries', async () => {
      const deletedCount = await dataStore.deleteOldEntries(new Date('2024-01-02T12:00:00Z'));

      expect(deletedCount).toBe(2); // Two entries before the cutoff date
      
      const remainingCount = await dataStore.count();
      expect(remainingCount).toBe(1);
    });
  });
});

/**
 * Helper function to create test log entries
 */
function createTestLogEntry(overrides: Partial<ParsedLogEntry> = {}): ParsedLogEntry {
  return {
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
    requestUrl: '/api/test',
    requestProtocol: 'HTTP/1.1',
    userAgent: 'TestAgent/1.0',
    sslCipher: 'ECDHE-RSA-AES128-GCM-SHA256',
    sslProtocol: 'TLSv1.2',
    targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test-targets/1234567890123456',
    traceId: 'Root=1-5e1b4151-5ac6c58f5b5daa6532e4f2e1',
    domainName: 'example.com',
    chosenCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    matchedRulePriority: 1,
    requestCreationTime: new Date('2024-01-01T09:59:59Z'),
    actionsExecuted: 'forward',
    redirectUrl: undefined,
    errorReason: undefined,
    targetPortList: '80',
    targetStatusCodeList: '200',
    classification: 'Normal',
    classificationReason: 'Normal request processing',
    ...overrides
  };
}