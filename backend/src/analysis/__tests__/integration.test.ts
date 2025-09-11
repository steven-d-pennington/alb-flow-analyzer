/**
 * Integration tests for the complete analysis workflow
 */

import { AnalysisEngine } from '../AnalysisEngine';
import { SqliteDataStore, ParsedLogEntry } from '../../database/DataStore';
import { ConnectionFactory } from '../../database/ConnectionFactory';
import { DatabaseConfig } from '../../database/types';
import { DatabaseSchemaManager } from '../../database/schema';
import * as fs from 'fs';
import * as path from 'path';

describe('Analysis Integration Tests', () => {
  let analysisEngine: AnalysisEngine;
  let dataStore: SqliteDataStore;
  let testDbPath: string;

  beforeAll(async () => {
    // Create a temporary test database
    testDbPath = path.join(__dirname, 'test_analysis.db');
    
    // Remove existing test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    const config: DatabaseConfig = {
      type: 'sqlite',
      database: testDbPath,
      maxConnections: 1
    };

    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const connection = await connectionPool.acquire();
    
    // Initialize schema
    const schemaManager = new DatabaseSchemaManager(connection);
    await schemaManager.initializeSchema();
    
    await connectionPool.release(connection);

    dataStore = new SqliteDataStore(connectionPool);
    analysisEngine = new AnalysisEngine(dataStore);
  });

  afterAll(async () => {
    // Clean up
    await dataStore.close();
    
    // Remove test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Clear data before each test
    await dataStore.clearData();
  });

  it('should perform complete analysis workflow with real database', async () => {
    // Create sample log entries
    const entries: ParsedLogEntry[] = [
      {
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
        classificationReason: 'User request'
      },
      {
        timestamp: new Date('2023-01-01T12:01:00Z'),
        clientIp: '192.168.1.101',
        targetIp: '10.0.1.51',
        requestProcessingTime: 0.067,
        targetProcessingTime: 0.034,
        responseProcessingTime: 0.015,
        elbStatusCode: 200,
        targetStatusCode: 200,
        receivedBytes: 512,
        sentBytes: 1536,
        requestVerb: 'GET',
        requestUrl: '/api/orders',
        requestProtocol: 'HTTP/1.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        sslCipher: 'ECDHE-RSA-AES128-GCM-SHA256',
        sslProtocol: 'TLSv1.2',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/73e2d6bc24d8a067',
        traceId: '1-5e1b4e5f-38a7-4c4f-9b8d-7c6e5d4c3b2b',
        domainName: 'example.com',
        chosenCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
        matchedRulePriority: 1,
        requestCreationTime: new Date('2023-01-01T12:01:00Z'),
        actionsExecuted: 'forward',
        redirectUrl: '',
        errorReason: '',
        targetPortList: '80',
        targetStatusCodeList: '200',
        classification: 'Normal',
        classificationReason: 'User request'
      },
      {
        timestamp: new Date('2023-01-01T12:02:00Z'),
        clientIp: '192.168.1.102',
        targetIp: '10.0.1.52',
        requestProcessingTime: 0.023,
        targetProcessingTime: 0.011,
        responseProcessingTime: 0.008,
        elbStatusCode: 404,
        targetStatusCode: 404,
        receivedBytes: 256,
        sentBytes: 512,
        requestVerb: 'GET',
        requestUrl: '/api/products',
        requestProtocol: 'HTTP/1.1',
        userAgent: 'curl/7.68.0',
        sslCipher: '',
        sslProtocol: '',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/73e2d6bc24d8a067',
        traceId: '1-5e1b4e5f-38a7-4c4f-9b8d-7c6e5d4c3b2c',
        domainName: 'example.com',
        chosenCertArn: '',
        matchedRulePriority: 1,
        requestCreationTime: new Date('2023-01-01T12:02:00Z'),
        actionsExecuted: 'forward',
        redirectUrl: '',
        errorReason: 'TargetNotFound',
        targetPortList: '80',
        targetStatusCodeList: '404',
        classification: 'Error',
        classificationReason: 'Target not found'
      }
    ];

    // Store entries in database
    const storeResult = await dataStore.store(entries);
    expect(storeResult.insertedCount).toBe(3);
    expect(storeResult.failedCount).toBe(0);

    // Perform analysis
    const analysisResult = await analysisEngine.analyzeTrafficPatterns();

    // Verify analysis results
    expect(analysisResult.metrics.totalRequests).toBe(3);
    expect(analysisResult.filteredEntryCount).toBe(3);
    expect(analysisResult.totalEntryCount).toBe(3);

    // Verify time series data
    expect(analysisResult.metrics.requestsPerMinute).toHaveLength(3);
    expect(analysisResult.metrics.requestsPerHour).toHaveLength(1);

    // Verify status code distribution
    expect(analysisResult.metrics.statusCodeDistribution).toHaveLength(2);
    const status200 = analysisResult.metrics.statusCodeDistribution.find(s => s.statusCode === 200);
    const status404 = analysisResult.metrics.statusCodeDistribution.find(s => s.statusCode === 404);
    expect(status200?.count).toBe(2);
    expect(status404?.count).toBe(1);

    // Verify endpoint statistics
    expect(analysisResult.metrics.endpointStats).toHaveLength(3);
    const usersEndpoint = analysisResult.metrics.endpointStats.find(e => e.endpoint === '/api/users');
    expect(usersEndpoint?.requestCount).toBe(1);
    expect(usersEndpoint?.errorRate).toBe(0);

    // Verify user agent statistics
    expect(analysisResult.metrics.userAgentStats.length).toBeGreaterThan(0);
    
    // Check if we have the expected categories
    const categories = analysisResult.metrics.userAgentStats.map(ua => ua.category);
    expect(categories).toContain('Desktop Browser');
    expect(categories).toContain('CLI Tool');

    // Verify response time calculations
    expect(analysisResult.metrics.responseTimePercentiles.min).toBeGreaterThan(0);
    expect(analysisResult.metrics.responseTimePercentiles.max).toBeGreaterThan(0);
    expect(analysisResult.metrics.responseTimePercentiles.average).toBeGreaterThan(0);

    // Verify processing time is recorded
    expect(analysisResult.processingTime).toBeGreaterThan(0);
    expect(analysisResult.lastUpdated).toBeDefined();
  });

  it('should apply filters correctly in database queries', async () => {
    // Create entries with different timestamps and endpoints
    const entries: ParsedLogEntry[] = [
      {
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
        userAgent: 'Mozilla/5.0 Chrome/91.0',
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
        classificationReason: 'User request'
      },
      {
        timestamp: new Date('2023-01-01T13:00:00Z'),
        clientIp: '192.168.1.101',
        targetIp: '10.0.1.51',
        requestProcessingTime: 0.067,
        targetProcessingTime: 0.034,
        responseProcessingTime: 0.015,
        elbStatusCode: 404,
        targetStatusCode: 404,
        receivedBytes: 512,
        sentBytes: 1536,
        requestVerb: 'GET',
        requestUrl: '/api/orders',
        requestProtocol: 'HTTP/1.1',
        userAgent: 'curl/7.68.0',
        sslCipher: '',
        sslProtocol: '',
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/73e2d6bc24d8a067',
        traceId: '1-5e1b4e5f-38a7-4c4f-9b8d-7c6e5d4c3b2b',
        domainName: 'example.com',
        chosenCertArn: '',
        matchedRulePriority: 1,
        requestCreationTime: new Date('2023-01-01T13:00:00Z'),
        actionsExecuted: 'forward',
        redirectUrl: '',
        errorReason: 'TargetNotFound',
        targetPortList: '80',
        targetStatusCodeList: '404',
        classification: 'Error',
        classificationReason: 'Target not found'
      }
    ];

    await dataStore.store(entries);

    // Test time range filter
    const timeFilter = {
      timeRange: {
        start: new Date('2023-01-01T12:30:00Z'),
        end: new Date('2023-01-01T13:30:00Z')
      }
    };

    const timeResult = await analysisEngine.analyzeTrafficPatterns(timeFilter);
    expect(timeResult.filteredEntryCount).toBe(1);
    expect(timeResult.totalEntryCount).toBe(2);

    // Test endpoint filter
    const endpointFilter = {
      endpoints: ['/api/users']
    };

    const endpointResult = await analysisEngine.analyzeTrafficPatterns(endpointFilter);
    expect(endpointResult.filteredEntryCount).toBe(1);
    expect(endpointResult.totalEntryCount).toBe(2);

    // Test status code filter
    const statusFilter = {
      statusCodes: [200]
    };

    const statusResult = await analysisEngine.analyzeTrafficPatterns(statusFilter);
    expect(statusResult.filteredEntryCount).toBe(1);
    expect(statusResult.totalEntryCount).toBe(2);
  });
});