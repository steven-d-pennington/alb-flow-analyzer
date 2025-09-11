/**
 * Tests for AnalysisEngine
 */

import { AnalysisEngine } from '../AnalysisEngine';
import { DataStore, ParsedLogEntry, FilterCriteria } from '../../database/DataStore';

// Mock DataStore implementation for testing
class MockDataStore implements DataStore {
  private entries: ParsedLogEntry[] = [];

  constructor(entries: ParsedLogEntry[] = []) {
    this.entries = entries;
  }

  async store(entries: ParsedLogEntry[]) {
    this.entries.push(...entries);
    return { insertedCount: entries.length, failedCount: 0, errors: [] };
  }

  async query(filters?: FilterCriteria): Promise<ParsedLogEntry[]> {
    let filtered = [...this.entries];

    if (filters?.timeRange) {
      filtered = filtered.filter(entry => 
        entry.timestamp >= filters.timeRange!.start && 
        entry.timestamp <= filters.timeRange!.end
      );
    }

    if (filters?.endpoints && filters.endpoints.length > 0) {
      filtered = filtered.filter(entry => 
        filters.endpoints!.includes(entry.requestUrl)
      );
    }

    if (filters?.statusCodes && filters.statusCodes.length > 0) {
      filtered = filtered.filter(entry => 
        filters.statusCodes!.includes(entry.elbStatusCode)
      );
    }

    return filtered;
  }

  async count(filters?: FilterCriteria): Promise<number> {
    const filtered = await this.query(filters);
    return filtered.length;
  }

  async createIndex(field: string): Promise<void> {}
  async dropIndex(indexName: string): Promise<void> {}
  async listIndexes(): Promise<string[]> { return []; }
  
  async getStats() {
    return {
      totalEntries: this.entries.length,
      databaseSize: 1024,
      oldestEntry: this.entries.length > 0 ? this.entries[0].timestamp : null,
      newestEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
      indexCount: 0
    };
  }

  async getDatabaseSize(): Promise<number> { return 1024; }
  async clearData(): Promise<void> { this.entries = []; }
  async deleteOldEntries(olderThan: Date): Promise<number> { return 0; }
  async close(): Promise<void> {}
}

// Helper function to create test log entries
const createTestEntry = (overrides: Partial<ParsedLogEntry> = {}): ParsedLogEntry => ({
  id: 1,
  timestamp: new Date('2023-01-01T12:00:00Z'),
  clientIp: '192.168.1.100',
  targetIp: '10.0.1.50',
  requestProcessingTime: 0.045,
  targetProcessingTime: 0.023,
  responseProcessingTime: 0.012,
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
  targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/73e2d6bc24d8a067',
  traceId: '1-5e1b4e5f-38a7-4c4f-9b8d-7c6e5d4c3b2a',
  domainName: 'example.com',
  chosenCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  matchedRulePriority: 1,
  requestCreationTime: new Date('2023-01-01T12:00:00Z'),
  actionsExecuted: 'forward',
  redirectUrl: '',
  errorReason: '',
  targetPortList: '80',
  targetStatusCodeList: '200',
  classification: 'Normal',
  classificationReason: 'User request',
  createdAt: new Date('2023-01-01T12:00:00Z'),
  ...overrides
});

describe('AnalysisEngine', () => {
  let analysisEngine: AnalysisEngine;
  let mockDataStore: MockDataStore;

  beforeEach(() => {
    mockDataStore = new MockDataStore();
    analysisEngine = new AnalysisEngine(mockDataStore);
  });

  describe('analyzeTrafficPatterns', () => {
    it('should return empty metrics for no data', async () => {
      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.totalRequests).toBe(0);
      expect(result.metrics.requestsPerMinute).toHaveLength(0);
      expect(result.metrics.requestsPerHour).toHaveLength(0);
      expect(result.metrics.peakPeriods).toHaveLength(0);
      expect(result.metrics.statusCodeDistribution).toHaveLength(0);
      expect(result.metrics.endpointStats).toHaveLength(0);
      expect(result.metrics.userAgentStats).toHaveLength(0);
      expect(result.filteredEntryCount).toBe(0);
      expect(result.totalEntryCount).toBe(0);
    });

    it('should calculate basic metrics for single entry', async () => {
      const entry = createTestEntry();
      await mockDataStore.store([entry]);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.totalRequests).toBe(1);
      expect(result.metrics.requestsPerMinute).toHaveLength(1);
      expect(result.metrics.requestsPerMinute[0].value).toBe(1);
      expect(result.metrics.statusCodeDistribution).toHaveLength(1);
      expect(result.metrics.statusCodeDistribution[0]).toEqual({
        statusCode: 200,
        count: 1,
        percentage: 100
      });
      expect(result.metrics.endpointStats).toHaveLength(1);
      expect(result.metrics.endpointStats[0].endpoint).toBe('/api/users');
      expect(result.filteredEntryCount).toBe(1);
      expect(result.totalEntryCount).toBe(1);
    });

    it('should calculate response time percentiles correctly', async () => {
      const entries = [
        createTestEntry({ requestProcessingTime: 0.010, targetProcessingTime: 0.020, responseProcessingTime: 0.005 }), // 35ms
        createTestEntry({ requestProcessingTime: 0.050, targetProcessingTime: 0.030, responseProcessingTime: 0.010 }), // 90ms
        createTestEntry({ requestProcessingTime: 0.100, targetProcessingTime: 0.050, responseProcessingTime: 0.020 }), // 170ms
        createTestEntry({ requestProcessingTime: 0.200, targetProcessingTime: 0.100, responseProcessingTime: 0.050 })  // 350ms
      ];
      await mockDataStore.store(entries);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.responseTimePercentiles.min).toBeCloseTo(35, 1);
      expect(result.metrics.responseTimePercentiles.max).toBeCloseTo(350, 1);
      expect(result.metrics.responseTimePercentiles.p50).toBeCloseTo(90, 1);
      expect(result.metrics.responseTimePercentiles.average).toBeCloseTo(161.25, 1);
    });

    it('should group requests by minute correctly', async () => {
      const entries = [
        createTestEntry({ timestamp: new Date('2023-01-01T12:00:00Z') }),
        createTestEntry({ timestamp: new Date('2023-01-01T12:00:30Z') }),
        createTestEntry({ timestamp: new Date('2023-01-01T12:01:00Z') }),
        createTestEntry({ timestamp: new Date('2023-01-01T12:01:45Z') })
      ];
      await mockDataStore.store(entries);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.requestsPerMinute).toHaveLength(2);
      expect(result.metrics.requestsPerMinute[0].timestamp).toBe('2023-01-01T12:00:00.000Z');
      expect(result.metrics.requestsPerMinute[0].value).toBe(2);
      expect(result.metrics.requestsPerMinute[1].timestamp).toBe('2023-01-01T12:01:00.000Z');
      expect(result.metrics.requestsPerMinute[1].value).toBe(2);
    });

    it('should calculate status code distribution correctly', async () => {
      const entries = [
        createTestEntry({ elbStatusCode: 200 }),
        createTestEntry({ elbStatusCode: 200 }),
        createTestEntry({ elbStatusCode: 404 }),
        createTestEntry({ elbStatusCode: 500 })
      ];
      await mockDataStore.store(entries);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.statusCodeDistribution).toHaveLength(3);
      expect(result.metrics.statusCodeDistribution[0]).toEqual({
        statusCode: 200,
        count: 2,
        percentage: 50
      });
      expect(result.metrics.statusCodeDistribution[1]).toEqual({
        statusCode: 404,
        count: 1,
        percentage: 25
      });
      expect(result.metrics.statusCodeDistribution[2]).toEqual({
        statusCode: 500,
        count: 1,
        percentage: 25
      });
    });

    it('should calculate endpoint statistics correctly', async () => {
      const entries = [
        createTestEntry({ 
          requestUrl: '/api/users', 
          elbStatusCode: 200,
          requestProcessingTime: 0.040,
          targetProcessingTime: 0.020,
          responseProcessingTime: 0.010
        }),
        createTestEntry({ 
          requestUrl: '/api/users', 
          elbStatusCode: 404,
          requestProcessingTime: 0.030,
          targetProcessingTime: 0.015,
          responseProcessingTime: 0.005
        }),
        createTestEntry({ 
          requestUrl: '/api/orders', 
          elbStatusCode: 200,
          requestProcessingTime: 0.060,
          targetProcessingTime: 0.030,
          responseProcessingTime: 0.015
        })
      ];
      await mockDataStore.store(entries);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.endpointStats).toHaveLength(2);
      
      const usersEndpoint = result.metrics.endpointStats.find(e => e.endpoint === '/api/users');
      expect(usersEndpoint).toBeDefined();
      expect(usersEndpoint!.requestCount).toBe(2);
      expect(usersEndpoint!.percentage).toBeCloseTo(66.67, 1);
      expect(usersEndpoint!.errorRate).toBe(50); // 1 error out of 2 requests
      
      const ordersEndpoint = result.metrics.endpointStats.find(e => e.endpoint === '/api/orders');
      expect(ordersEndpoint).toBeDefined();
      expect(ordersEndpoint!.requestCount).toBe(1);
      expect(ordersEndpoint!.percentage).toBeCloseTo(33.33, 1);
      expect(ordersEndpoint!.errorRate).toBe(0); // No errors
    });

    it('should categorize user agents correctly', async () => {
      const entries = [
        createTestEntry({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }),
        createTestEntry({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15' }),
        createTestEntry({ userAgent: 'curl/7.68.0' }),
        createTestEntry({ userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)' })
      ];
      await mockDataStore.store(entries);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.userAgentStats).toHaveLength(4);
      
      const chromeAgent = result.metrics.userAgentStats.find(ua => ua.userAgent.includes('Chrome'));
      expect(chromeAgent?.category).toBe('Desktop Browser');
      
      const safariAgent = result.metrics.userAgentStats.find(ua => ua.userAgent.includes('Safari'));
      expect(safariAgent?.category).toBe('Desktop Browser');
      
      const curlAgent = result.metrics.userAgentStats.find(ua => ua.userAgent.includes('curl'));
      expect(curlAgent?.category).toBe('CLI Tool');
      
      const botAgent = result.metrics.userAgentStats.find(ua => ua.userAgent.includes('Googlebot'));
      expect(botAgent?.category).toBe('Bot');
    });

    it('should apply filters correctly', async () => {
      const entries = [
        createTestEntry({ 
          timestamp: new Date('2023-01-01T12:00:00Z'),
          requestUrl: '/api/users',
          elbStatusCode: 200
        }),
        createTestEntry({ 
          timestamp: new Date('2023-01-01T13:00:00Z'),
          requestUrl: '/api/orders',
          elbStatusCode: 404
        }),
        createTestEntry({ 
          timestamp: new Date('2023-01-01T14:00:00Z'),
          requestUrl: '/api/users',
          elbStatusCode: 500
        })
      ];
      await mockDataStore.store(entries);

      // Test time range filter
      const timeFilter: FilterCriteria = {
        timeRange: {
          start: new Date('2023-01-01T12:30:00Z'),
          end: new Date('2023-01-01T13:30:00Z')
        }
      };

      const timeResult = await analysisEngine.analyzeTrafficPatterns(timeFilter);
      expect(timeResult.filteredEntryCount).toBe(1);
      expect(timeResult.totalEntryCount).toBe(3);

      // Test endpoint filter
      const endpointFilter: FilterCriteria = {
        endpoints: ['/api/users']
      };

      const endpointResult = await analysisEngine.analyzeTrafficPatterns(endpointFilter);
      expect(endpointResult.filteredEntryCount).toBe(2);
      expect(endpointResult.totalEntryCount).toBe(3);

      // Test status code filter
      const statusFilter: FilterCriteria = {
        statusCodes: [200, 404]
      };

      const statusResult = await analysisEngine.analyzeTrafficPatterns(statusFilter);
      expect(statusResult.filteredEntryCount).toBe(2);
      expect(statusResult.totalEntryCount).toBe(3);
    });

    it('should identify peak periods correctly', async () => {
      // Create entries with varying traffic patterns
      const entries = [];
      
      // Low traffic period (10 requests/minute)
      for (let i = 0; i < 10; i++) {
        entries.push(createTestEntry({ 
          timestamp: new Date(`2023-01-01T12:${i.toString().padStart(2, '0')}:00Z`)
        }));
      }
      
      // High traffic period (100 requests/minute) - should be identified as peak
      for (let i = 0; i < 60; i++) { // Limit to 60 seconds in a minute
        entries.push(createTestEntry({ 
          timestamp: new Date(`2023-01-01T13:00:${i.toString().padStart(2, '0')}Z`)
        }));
      }
      
      // Medium traffic period (30 requests/minute)
      for (let i = 0; i < 30; i++) {
        entries.push(createTestEntry({ 
          timestamp: new Date(`2023-01-01T14:${i.toString().padStart(2, '0')}:00Z`)
        }));
      }

      await mockDataStore.store(entries);

      const result = await analysisEngine.analyzeTrafficPatterns();

      expect(result.metrics.peakPeriods.length).toBeGreaterThan(0);
      
      // The peak should be the 13:00 period with 60 requests
      const topPeak = result.metrics.peakPeriods[0];
      expect(topPeak.requestCount).toBe(60);
      expect(topPeak.startTime).toBe('2023-01-01T13:00:00.000Z');
    });
  });
});