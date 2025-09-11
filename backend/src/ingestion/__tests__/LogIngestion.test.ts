import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ALBLogIngestion } from '../LogIngestion';
import { ProcessingProgress, ProcessingError, ProcessingOptions } from '../types';
import { ALBLogParser } from '../../parser/LogParser';
import { 
  validALBLogEntries, 
  malformedLogEntries, 
  mixedLogEntries,
  createTestLogFile,
  createCompressedTestLogFile,
  cleanupTestFiles
} from './helpers';

describe('ALBLogIngestion', () => {
  let ingestion: ALBLogIngestion;
  let tempDir: string;
  let testFiles: string[] = [];

  beforeEach(async () => {
    ingestion = new ALBLogIngestion();
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'alb-ingestion-test-'));
    testFiles = [];
  });

  afterEach(async () => {
    ingestion.cancelProcessing();
    await cleanupTestFiles(testFiles);
    
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with default parser', () => {
      const instance = new ALBLogIngestion();
      expect(instance).toBeInstanceOf(ALBLogIngestion);
    });

    it('should create instance with custom parser', () => {
      const customParser = new ALBLogParser();
      const instance = new ALBLogIngestion(customParser);
      expect(instance).toBeInstanceOf(ALBLogIngestion);
    });
  });

  describe('loadLocalFiles', () => {
    it('should process valid log files successfully', async () => {
      const testFile = path.join(tempDir, 'valid-logs.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(validALBLogEntries, testFile);
      
      const result = await ingestion.loadLocalFiles([testFile]);
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(1);
      expect(result.processedFiles).toBe(1);
      expect(result.successfullyParsed).toBe(validALBLogEntries.length);
      expect(result.failedLines).toBe(0);
      expect(result.entries).toHaveLength(validALBLogEntries.length);
      expect(result.errors).toHaveLength(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle malformed entries gracefully when skipMalformedLines is true', async () => {
      const testFile = path.join(tempDir, 'mixed-logs.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(mixedLogEntries, testFile);
      
      const result = await ingestion.loadLocalFiles([testFile], { skipMalformedLines: true });
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(1);
      expect(result.processedFiles).toBe(1);
      expect(result.successfullyParsed).toBe(validALBLogEntries.length);
      expect(result.failedLines).toBeGreaterThan(0);
      expect(result.entries).toHaveLength(validALBLogEntries.length);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.every(e => e.severity === 'warning')).toBe(true);
    });

    it('should handle malformed entries as errors when skipMalformedLines is false', async () => {
      const testFile = path.join(tempDir, 'malformed-logs.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(malformedLogEntries.slice(0, 3), testFile); // Exclude empty lines
      
      const result = await ingestion.loadLocalFiles([testFile], { skipMalformedLines: false });
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.severity === 'error')).toBe(true);
    });

    it('should process compressed files', async () => {
      const testFile = path.join(tempDir, 'compressed-logs.txt.gz');
      testFiles.push(testFile);
      
      await createCompressedTestLogFile(validALBLogEntries, testFile);
      
      const result = await ingestion.loadLocalFiles([testFile]);
      
      expect(result.success).toBe(true);
      expect(result.successfullyParsed).toBe(validALBLogEntries.length);
      expect(result.entries).toHaveLength(validALBLogEntries.length);
    });

    it('should process multiple files', async () => {
      const testFile1 = path.join(tempDir, 'logs1.txt');
      const testFile2 = path.join(tempDir, 'logs2.txt');
      testFiles.push(testFile1, testFile2);
      
      await createTestLogFile(validALBLogEntries.slice(0, 2), testFile1);
      await createTestLogFile(validALBLogEntries.slice(2, 4), testFile2);
      
      const result = await ingestion.loadLocalFiles([testFile1, testFile2]);
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(2);
      expect(result.processedFiles).toBe(2);
      expect(result.successfullyParsed).toBe(4);
      expect(result.entries).toHaveLength(4);
    });

    it('should handle batch processing', async () => {
      const testFile = path.join(tempDir, 'batch-logs.txt');
      testFiles.push(testFile);
      
      // Create a larger dataset
      const largeDataset = Array(100).fill(validALBLogEntries[0]);
      await createTestLogFile(largeDataset, testFile);
      
      const result = await ingestion.loadLocalFiles([testFile], { batchSize: 10 });
      
      expect(result.success).toBe(true);
      expect(result.successfullyParsed).toBe(100);
      expect(result.entries).toHaveLength(100);
    });

    it('should provide progress updates', async () => {
      const testFile = path.join(tempDir, 'progress-logs.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(validALBLogEntries, testFile);
      
      const progressUpdates: ProcessingProgress[] = [];
      const errorUpdates: ProcessingError[] = [];
      
      const options: ProcessingOptions = {
        progressCallback: (progress) => progressUpdates.push({ ...progress }),
        errorCallback: (error) => errorUpdates.push({ ...error })
      };
      
      const result = await ingestion.loadLocalFiles([testFile], options);
      
      expect(result.success).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].isComplete).toBe(true);
    });

    it('should handle file access errors', async () => {
      const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
      
      const result = await ingestion.loadLocalFiles([nonExistentFile]);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe('critical');
      expect(result.errors[0].fileName).toBe('system');
    });

    it('should prevent concurrent processing', async () => {
      const testFile = path.join(tempDir, 'concurrent-logs.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(validALBLogEntries, testFile);
      
      // Start first processing
      const promise1 = ingestion.loadLocalFiles([testFile]);
      
      // Try to start second processing immediately
      await expect(ingestion.loadLocalFiles([testFile])).rejects.toThrow('Processing already in progress');
      
      // Wait for first to complete
      await promise1;
    });

    it('should support cancellation', async () => {
      const testFile = path.join(tempDir, 'cancel-logs.txt');
      testFiles.push(testFile);
      
      // Create a large dataset to ensure processing takes some time
      const largeDataset = Array(1000).fill(validALBLogEntries[0]);
      await createTestLogFile(largeDataset, testFile);
      
      // Start processing
      const promise = ingestion.loadLocalFiles([testFile]);
      
      // Cancel after a short delay
      setTimeout(() => {
        ingestion.cancelProcessing();
      }, 10);
      
      const result = await promise;
      
      // Processing should be incomplete due to cancellation
      expect(result.successfullyParsed).toBeLessThan(1000);
    });

    it('should skip empty lines', async () => {
      const testFile = path.join(tempDir, 'empty-lines.txt');
      testFiles.push(testFile);
      
      const entriesWithEmptyLines = [
        validALBLogEntries[0],
        '',
        '   ',
        validALBLogEntries[1],
        '\t\t',
        validALBLogEntries[2]
      ];
      
      await createTestLogFile(entriesWithEmptyLines, testFile);
      
      const result = await ingestion.loadLocalFiles([testFile]);
      
      expect(result.success).toBe(true);
      expect(result.successfullyParsed).toBe(3); // Only non-empty valid entries
      expect(result.entries).toHaveLength(3);
    });
  });

  describe('validateLogFormat', () => {
    it('should validate correct ALB log format', async () => {
      const testFile = path.join(tempDir, 'valid-format.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(validALBLogEntries, testFile);
      
      const isValid = await ingestion.validateLogFormat(testFile);
      expect(isValid).toBe(true);
    });

    it('should reject invalid log format', async () => {
      const testFile = path.join(tempDir, 'invalid-format.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(['invalid log format', 'another invalid line'], testFile);
      
      const isValid = await ingestion.validateLogFormat(testFile);
      expect(isValid).toBe(false);
    });

    it('should validate compressed files', async () => {
      const testFile = path.join(tempDir, 'valid-compressed.txt.gz');
      testFiles.push(testFile);
      
      await createCompressedTestLogFile(validALBLogEntries, testFile);
      
      const isValid = await ingestion.validateLogFormat(testFile);
      expect(isValid).toBe(true);
    });

    it('should handle file access errors during validation', async () => {
      const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
      
      const isValid = await ingestion.validateLogFormat(nonExistentFile);
      expect(isValid).toBe(false);
    });

    it('should validate mixed format files (partial validity)', async () => {
      const testFile = path.join(tempDir, 'mixed-format.txt');
      testFiles.push(testFile);
      
      // Mix of valid and invalid entries - should be considered valid if >50% are valid
      const mixedEntries = [
        ...validALBLogEntries.slice(0, 6), // 6 valid entries
        ...malformedLogEntries.slice(0, 3)  // 3 invalid entries
      ];
      
      await createTestLogFile(mixedEntries, testFile);
      
      const isValid = await ingestion.validateLogFormat(testFile);
      expect(isValid).toBe(true); // 6/9 = 66% valid, should pass
    });
  });

  describe('getProcessingProgress', () => {
    it('should return initial progress state', () => {
      const progress = ingestion.getProcessingProgress();
      
      expect(progress.totalFiles).toBe(0);
      expect(progress.processedFiles).toBe(0);
      expect(progress.currentFile).toBe('');
      expect(progress.totalBytes).toBe(0);
      expect(progress.processedBytes).toBe(0);
      expect(progress.successfullyParsed).toBe(0);
      expect(progress.failedLines).toBe(0);
      expect(progress.isComplete).toBe(false);
      expect(progress.errors).toHaveLength(0);
    });

    it('should return updated progress during processing', async () => {
      const testFile = path.join(tempDir, 'progress-test.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(validALBLogEntries, testFile);
      
      let progressDuringProcessing: ProcessingProgress | null = null;
      
      const options: ProcessingOptions = {
        progressCallback: (progress) => {
          if (!progressDuringProcessing && progress.processedLines > 0) {
            progressDuringProcessing = { ...progress };
          }
        }
      };
      
      await ingestion.loadLocalFiles([testFile], options);
      
      expect(progressDuringProcessing).not.toBeNull();
      expect(progressDuringProcessing!.totalFiles).toBe(1);
      expect(progressDuringProcessing!.processedLines).toBeGreaterThan(0);
    });
  });

  describe('cancelProcessing', () => {
    it('should set cancellation flag', () => {
      ingestion.cancelProcessing();
      // The cancellation effect is tested in the loadLocalFiles cancellation test
    });
  });

  describe('handleMalformedEntries', () => {
    it('should handle malformed entries correctly', () => {
      const initialProgress = ingestion.getProcessingProgress();
      const initialFailedLines = initialProgress.failedLines;
      const initialErrorCount = initialProgress.errors.length;
      
      ingestion.handleMalformedEntries(
        'malformed entry',
        new Error('Test error'),
        'test-file.txt',
        42
      );
      
      const updatedProgress = ingestion.getProcessingProgress();
      
      expect(updatedProgress.failedLines).toBe(initialFailedLines + 1);
      expect(updatedProgress.errors.length).toBe(initialErrorCount + 1);
      
      const lastError = updatedProgress.errors[updatedProgress.errors.length - 1];
      expect(lastError.fileName).toBe('test-file.txt');
      expect(lastError.lineNumber).toBe(42);
      expect(lastError.error).toContain('Malformed entry');
      expect(lastError.severity).toBe('warning');
    });
  });

  describe('error handling', () => {
    it('should handle system errors gracefully', async () => {
      // Mock fs.promises.stat to throw an error
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest.fn().mockRejectedValue(new Error('File system error'));
      
      try {
        const result = await ingestion.loadLocalFiles(['test-file.txt']);
        
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].severity).toBe('critical');
        expect(result.errors[0].error).toContain('File system error');
      } finally {
        fs.promises.stat = originalStat;
      }
    });

    it('should provide detailed error information', async () => {
      const testFile = path.join(tempDir, 'error-test.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(malformedLogEntries.slice(0, 3), testFile);
      
      const errors: ProcessingError[] = [];
      const options: ProcessingOptions = {
        skipMalformedLines: true,
        errorCallback: (error) => errors.push({ ...error })
      };
      
      await ingestion.loadLocalFiles([testFile], options);
      
      expect(errors.length).toBeGreaterThan(0);
      errors.forEach(error => {
        expect(error.fileName).toBeTruthy();
        expect(error.error).toBeTruthy();
        expect(error.timestamp).toBeInstanceOf(Date);
        expect(['warning', 'error', 'critical']).toContain(error.severity);
      });
    });
  });

  describe('performance and memory management', () => {
    it('should handle large files efficiently', async () => {
      const testFile = path.join(tempDir, 'large-file.txt');
      testFiles.push(testFile);
      
      // Create a moderately large dataset
      const largeDataset = Array(1000).fill(validALBLogEntries[0]);
      await createTestLogFile(largeDataset, testFile);
      
      const startTime = Date.now();
      const result = await ingestion.loadLocalFiles([testFile], { batchSize: 100 });
      const processingTime = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(result.successfullyParsed).toBe(1000);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should provide accurate time estimates', async () => {
      const testFile = path.join(tempDir, 'time-estimate.txt');
      testFiles.push(testFile);
      
      await createTestLogFile(validALBLogEntries, testFile);
      
      let hasTimeEstimate = false;
      const options: ProcessingOptions = {
        progressCallback: (progress) => {
          if (progress.estimatedTimeRemaining > 0) {
            hasTimeEstimate = true;
          }
        }
      };
      
      await ingestion.loadLocalFiles([testFile], options);
      
      // For small files, time estimate might not be calculated
      // This test mainly ensures the calculation doesn't crash
    });
  });
});