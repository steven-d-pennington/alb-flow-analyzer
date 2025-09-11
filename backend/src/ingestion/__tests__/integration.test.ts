import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ALBLogIngestion } from '../LogIngestion';
import { ALBLogParser } from '../../parser/LogParser';
import { ProcessingOptions } from '../types';
import { 
  validALBLogEntries,
  createTestLogFile,
  createCompressedTestLogFile,
  cleanupTestFiles
} from './helpers';

describe('ALB Log Ingestion Integration Tests', () => {
  let tempDir: string;
  let testFiles: string[] = [];

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'alb-integration-test-'));
    testFiles = [];
  });

  afterEach(async () => {
    await cleanupTestFiles(testFiles);
    
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('End-to-End Processing Pipeline', () => {
    it('should process complete workflow from file to parsed entries', async () => {
      // Create test files with different scenarios
      const validFile = path.join(tempDir, 'valid-logs.txt');
      const compressedFile = path.join(tempDir, 'compressed-logs.txt.gz');
      const mixedFile = path.join(tempDir, 'mixed-logs.txt');
      
      testFiles.push(validFile, compressedFile, mixedFile);
      
      // Create files with different content
      await createTestLogFile(validALBLogEntries.slice(0, 3), validFile);
      await createCompressedTestLogFile(validALBLogEntries.slice(3, 5), compressedFile);
      
      const mixedContent = [
        validALBLogEntries[0],
        'invalid log entry',
        validALBLogEntries[1],
        '', // empty line
        validALBLogEntries[2]
      ];
      await createTestLogFile(mixedContent, mixedFile);
      
      // Process all files
      const ingestion = new ALBLogIngestion();
      const result = await ingestion.loadLocalFiles([validFile, compressedFile, mixedFile], {
        skipMalformedLines: true,
        batchSize: 2
      });
      
      // Verify results
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(3);
      expect(result.processedFiles).toBe(3);
      expect(result.successfullyParsed).toBe(8); // 3 + 2 + 3 valid entries
      expect(result.failedLines).toBe(1); // 1 invalid entry
      expect(result.entries).toHaveLength(8);
      expect(result.errors.length).toBe(1);
      expect(result.processingTime).toBeGreaterThan(0);
      
      // Verify entry structure
      result.entries.forEach(entry => {
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('clientIp');
        expect(entry).toHaveProperty('requestUrl');
        expect(entry).toHaveProperty('elbStatusCode');
        expect(entry.timestamp).toBeInstanceOf(Date);
        expect(typeof entry.elbStatusCode).toBe('number');
      });
    });

    it('should handle real-world ALB log patterns', async () => {
      const testFile = path.join(tempDir, 'realworld-logs.txt');
      testFiles.push(testFile);
      
      // Simulate real-world log patterns with various scenarios
      const realWorldLogs = [
        // Successful API requests
        'h2 2023-12-01T10:30:45.123456Z app/api-lb/50dc6c495c0c9188 203.0.113.12:54321 10.0.1.50:8080 0.001 0.045 0.002 200 200 1024 2048 "GET https://api.example.com/v1/users/123 HTTP/1.1" "MyApp/1.0 (iOS; 16.0)" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/api-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "api.example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 1 2023-12-01T10:30:45.122456Z "forward" "-" "-" "10.0.1.50:8080" "200" "-" "-"',
        
        // POST with authentication
        'h2 2023-12-01T10:31:15.456789Z app/api-lb/50dc6c495c0c9188 203.0.113.13:54322 10.0.1.51:8080 0.002 0.123 0.003 201 201 512 1024 "POST https://api.example.com/v1/orders HTTP/1.1" "curl/7.68.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/api-targets/73e2d6bc24d8a067 "Root=1-58337263-36d228ad5d99923122bbe355" "api.example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 2 2023-12-01T10:31:15.455789Z "authenticate,forward" "-" "-" "10.0.1.51:8080" "201" "-" "-"',
        
        // Rate limited request
        'h2 2023-12-01T10:32:00.789012Z app/api-lb/50dc6c495c0c9188 203.0.113.14:54323 - 0.001 -1 -1 429 - 0 256 "GET https://api.example.com/v1/data HTTP/1.1" "BotClient/1.0" - - arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/api-targets/73e2d6bc24d8a067 "Root=1-58337264-36d228ad5d99923122bbe356" "api.example.com" "-" 3 2023-12-01T10:32:00.788012Z "fixed-response" "-" "RateLimited" "-" "-" "-" "-"',
        
        // Health check
        'h2 2023-12-01T10:33:30.012345Z app/api-lb/50dc6c495c0c9188 10.0.0.100:54324 10.0.1.52:8080 0.000 0.001 0.000 200 200 0 64 "GET https://api.example.com/health HTTP/1.1" "ELB-HealthChecker/2.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/api-targets/73e2d6bc24d8a067 "Root=1-58337265-36d228ad5d99923122bbe357" "api.example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2023-12-01T10:33:30.011345Z "forward" "-" "-" "10.0.1.52:8080" "200" "-" "-"',
        
        // WebSocket upgrade
        'h2 2023-12-01T10:34:45.345678Z app/api-lb/50dc6c495c0c9188 203.0.113.15:54325 10.0.1.53:8080 0.001 0.002 0.001 101 101 256 128 "GET https://api.example.com/ws HTTP/1.1" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/api-targets/73e2d6bc24d8a067 "Root=1-58337266-36d228ad5d99923122bbe358" "api.example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 4 2023-12-01T10:34:45.344678Z "forward" "-" "-" "10.0.1.53:8080" "101" "-" "-"'
      ];
      
      await createTestLogFile(realWorldLogs, testFile);
      
      const ingestion = new ALBLogIngestion();
      const result = await ingestion.loadLocalFiles([testFile]);
      
      expect(result.success).toBe(true);
      expect(result.successfullyParsed).toBe(5);
      expect(result.entries).toHaveLength(5);
      
      // Verify specific patterns
      const entries = result.entries;
      
      // Check API request
      const apiRequest = entries.find(e => e.requestUrl.includes('/v1/users/123'));
      expect(apiRequest).toBeDefined();
      expect(apiRequest!.elbStatusCode).toBe(200);
      expect(apiRequest!.targetStatusCode).toBe(200);
      expect(apiRequest!.userAgent).toContain('MyApp/1.0');
      
      // Check POST request
      const postRequest = entries.find(e => e.requestVerb === 'POST');
      expect(postRequest).toBeDefined();
      expect(postRequest!.elbStatusCode).toBe(201);
      expect(postRequest!.actionsExecuted).toBe('authenticate,forward');
      
      // Check rate limited request
      const rateLimited = entries.find(e => e.elbStatusCode === 429);
      expect(rateLimited).toBeDefined();
      expect(rateLimited!.targetStatusCode).toBe(0); // No target reached
      expect(rateLimited!.actionsExecuted).toBe('fixed-response');
      
      // Check health check
      const healthCheck = entries.find(e => e.requestUrl.includes('/health'));
      expect(healthCheck).toBeDefined();
      expect(healthCheck!.userAgent).toContain('ELB-HealthChecker');
      
      // Check WebSocket upgrade
      const wsUpgrade = entries.find(e => e.elbStatusCode === 101);
      expect(wsUpgrade).toBeDefined();
      expect(wsUpgrade!.requestUrl).toContain('/ws');
    });

    it('should maintain data integrity across processing pipeline', async () => {
      const testFile = path.join(tempDir, 'integrity-test.txt');
      testFiles.push(testFile);
      
      // Use a known log entry for integrity verification
      const knownEntry = 'h2 2023-12-01T10:30:45.123456Z app/test-lb/50dc6c495c0c9188 192.168.1.100:54321 10.0.1.50:80 0.001 0.002 0.003 200 200 1024 2048 "GET https://example.com/api/test HTTP/1.1" "TestAgent/1.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 5 2023-12-01T10:30:45.122456Z "forward" "-" "-" "10.0.1.50:80" "200" "-" "-"';
      
      await createTestLogFile([knownEntry], testFile);
      
      const ingestion = new ALBLogIngestion();
      const result = await ingestion.loadLocalFiles([testFile]);
      
      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(1);
      
      const entry = result.entries[0];
      
      // Verify all fields are correctly parsed
      expect(entry.timestamp).toEqual(new Date('2023-12-01T10:30:45.123456Z'));
      expect(entry.clientIp).toBe('192.168.1.100');
      expect(entry.targetIp).toBe('10.0.1.50');
      expect(entry.requestProcessingTime).toBe(0.001);
      expect(entry.targetProcessingTime).toBe(0.002);
      expect(entry.responseProcessingTime).toBe(0.003);
      expect(entry.elbStatusCode).toBe(200);
      expect(entry.targetStatusCode).toBe(200);
      expect(entry.receivedBytes).toBe(1024);
      expect(entry.sentBytes).toBe(2048);
      expect(entry.requestVerb).toBe('GET');
      expect(entry.requestUrl).toBe('https://example.com/api/test');
      expect(entry.requestProtocol).toBe('HTTP/1.1');
      expect(entry.userAgent).toBe('TestAgent/1.0');
      expect(entry.sslCipher).toBe('ECDHE-RSA-AES128-GCM-SHA256');
      expect(entry.sslProtocol).toBe('TLSv1.2');
      expect(entry.targetGroupArn).toBe('arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-targets/73e2d6bc24d8a067');
      expect(entry.traceId).toBe('Root=1-58337262-36d228ad5d99923122bbe354');
      expect(entry.domainName).toBe('example.com');
      expect(entry.chosenCertArn).toBe('arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012');
      expect(entry.matchedRulePriority).toBe(5);
      expect(entry.requestCreationTime).toEqual(new Date('2023-12-01T10:30:45.122456Z'));
      expect(entry.actionsExecuted).toBe('forward');
      expect(entry.redirectUrl).toBe('');
      expect(entry.errorReason).toBe('');
      expect(entry.targetPortList).toBe('10.0.1.50:80');
      expect(entry.targetStatusCodeList).toBe('200');
      expect(entry.classification).toBe('');
      expect(entry.classificationReason).toBe('');
    });

    it('should handle concurrent file processing efficiently', async () => {
      // Create multiple test files
      const fileCount = 5;
      const entriesPerFile = 20;
      
      for (let i = 0; i < fileCount; i++) {
        const testFile = path.join(tempDir, `concurrent-${i}.txt`);
        testFiles.push(testFile);
        
        const entries = Array(entriesPerFile).fill(validALBLogEntries[i % validALBLogEntries.length]);
        await createTestLogFile(entries, testFile);
      }
      
      const ingestion = new ALBLogIngestion();
      const startTime = Date.now();
      
      const result = await ingestion.loadLocalFiles(testFiles, {
        maxConcurrentFiles: 3,
        batchSize: 10
      });
      
      const processingTime = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(fileCount);
      expect(result.processedFiles).toBe(fileCount);
      expect(result.successfullyParsed).toBe(fileCount * entriesPerFile);
      expect(result.entries).toHaveLength(fileCount * entriesPerFile);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it('should provide comprehensive progress tracking', async () => {
      const testFile = path.join(tempDir, 'progress-tracking.txt');
      testFiles.push(testFile);
      
      // Create a moderately sized file for progress tracking
      const entries = Array(100).fill(validALBLogEntries[0]);
      await createTestLogFile(entries, testFile);
      
      const progressUpdates: any[] = [];
      const errorUpdates: any[] = [];
      
      const options: ProcessingOptions = {
        batchSize: 10,
        progressCallback: (progress) => {
          progressUpdates.push({
            processedFiles: progress.processedFiles,
            processedLines: progress.processedLines,
            successfullyParsed: progress.successfullyParsed,
            processedBytes: progress.processedBytes,
            isComplete: progress.isComplete
          });
        },
        errorCallback: (error) => {
          errorUpdates.push({
            fileName: error.fileName,
            severity: error.severity
          });
        }
      };
      
      const ingestion = new ALBLogIngestion();
      const result = await ingestion.loadLocalFiles([testFile], options);
      
      expect(result.success).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Verify progress progression
      expect(progressUpdates[0].processedLines).toBe(0);
      expect(progressUpdates[progressUpdates.length - 1].isComplete).toBe(true);
      expect(progressUpdates[progressUpdates.length - 1].successfullyParsed).toBe(100);
      
      // Verify progress is monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i].processedLines).toBeGreaterThanOrEqual(progressUpdates[i - 1].processedLines);
        expect(progressUpdates[i].processedBytes).toBeGreaterThanOrEqual(progressUpdates[i - 1].processedBytes);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from partial file corruption', async () => {
      const testFile = path.join(tempDir, 'partially-corrupted.txt');
      testFiles.push(testFile);
      
      // Mix valid entries with corrupted ones
      const mixedContent = [
        validALBLogEntries[0],
        validALBLogEntries[1],
        'corrupted line 1',
        validALBLogEntries[2],
        'corrupted line 2 with invalid timestamp',
        validALBLogEntries[3],
        validALBLogEntries[4]
      ];
      
      await createTestLogFile(mixedContent, testFile);
      
      const ingestion = new ALBLogIngestion();
      const result = await ingestion.loadLocalFiles([testFile], { skipMalformedLines: true });
      
      expect(result.success).toBe(true);
      expect(result.successfullyParsed).toBe(5); // Valid entries
      expect(result.failedLines).toBe(2); // Corrupted entries
      expect(result.entries).toHaveLength(5);
      expect(result.errors).toHaveLength(2);
      
      // Verify error details
      result.errors.forEach(error => {
        expect(error.severity).toBe('warning');
        expect(error.fileName).toBe('partially-corrupted.txt');
        expect(error.lineNumber).toBeGreaterThan(0);
      });
    });

    it('should handle mixed file types gracefully', async () => {
      const regularFile = path.join(tempDir, 'regular.txt');
      const compressedFile = path.join(tempDir, 'compressed.txt.gz');
      const emptyFile = path.join(tempDir, 'empty.txt');
      
      testFiles.push(regularFile, compressedFile, emptyFile);
      
      await createTestLogFile(validALBLogEntries.slice(0, 2), regularFile);
      await createCompressedTestLogFile(validALBLogEntries.slice(2, 4), compressedFile);
      await createTestLogFile([], emptyFile); // Empty file
      
      const ingestion = new ALBLogIngestion();
      const result = await ingestion.loadLocalFiles([regularFile, compressedFile, emptyFile]);
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(3);
      expect(result.processedFiles).toBe(3);
      expect(result.successfullyParsed).toBe(4); // 2 + 2 + 0
      expect(result.entries).toHaveLength(4);
    });
  });
});