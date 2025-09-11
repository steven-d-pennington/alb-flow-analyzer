import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { createReadStream, ReadStream } from 'fs';
import { createInterface, Interface } from 'readline';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

import { LogIngestion, ProcessingProgress, ProcessingError, FileInfo, ProcessingOptions, ProcessingResult } from './types';
import { ParsedLogEntry, LogParser } from '../parser/types';
import { ALBLogParser } from '../parser/LogParser';
import { SqliteDataStore } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { ALBWebSocketServer } from '../websocket/WebSocketServer';

/**
 * Log Ingestion Pipeline
 * 
 * Handles processing of ALB flow log files with support for:
 * - Local file processing
 * - Compressed file support (gzip)
 * - Batch processing with progress tracking
 * - Error handling and recovery
 * - Real-time progress updates
 */
export class ALBLogIngestion implements LogIngestion {
  private parser: LogParser;
  private currentProgress: ProcessingProgress;
  private isProcessing: boolean = false;
  private shouldCancel: boolean = false;
  private progressCallback?: (progress: ProcessingProgress) => void;
  private errorCallback?: (error: ProcessingError) => void;
  private wsServer?: ALBWebSocketServer;

  constructor(parser?: LogParser, wsServer?: ALBWebSocketServer) {
    this.parser = parser || new ALBLogParser();
    this.currentProgress = this.initializeProgress();
    this.wsServer = wsServer;
  }

  /**
   * Load and process local log files
   */
  async loadLocalFiles(filePaths: string[], options: ProcessingOptions = {}): Promise<ProcessingResult> {
    if (this.isProcessing) {
      throw new Error('Processing already in progress. Cancel current processing before starting new one.');
    }

    this.isProcessing = true;
    this.shouldCancel = false;
    this.progressCallback = options.progressCallback;
    this.errorCallback = options.errorCallback;

    const startTime = Date.now();
    const batchSize = options.batchSize || 1000;
    const maxConcurrentFiles = options.maxConcurrentFiles || 1;
    const skipMalformedLines = options.skipMalformedLines !== false; // Default to true

    try {
      // Validate and get file info
      let fileInfos: FileInfo[];
      try {
        fileInfos = await this.getFileInfos(filePaths);
      } catch (error) {
        const processingError: ProcessingError = {
          fileName: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          timestamp: new Date(),
          severity: 'critical'
        };
        
        return {
          success: false,
          totalFiles: filePaths.length,
          processedFiles: 0,
          totalLines: 0,
          successfullyParsed: 0,
          failedLines: 0,
          entries: [],
          errors: [processingError],
          processingTime: Date.now() - startTime
        };
      }
      
      // Initialize progress
      this.currentProgress = {
        ...this.initializeProgress(),
        totalFiles: fileInfos.length,
        totalBytes: fileInfos.reduce((sum, info) => sum + info.size, 0),
        startTime: new Date()
      };

      const allEntries: ParsedLogEntry[] = [];
      const allErrors: ProcessingError[] = [];

      // Process files in batches to control memory usage
      for (let i = 0; i < fileInfos.length; i += maxConcurrentFiles) {
        if (this.shouldCancel) {
          break;
        }

        const batch = fileInfos.slice(i, i + maxConcurrentFiles);
        const batchPromises = batch.map(fileInfo => 
          this.processFile(fileInfo, batchSize, skipMalformedLines)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            allEntries.push(...result.value.entries);
            allErrors.push(...result.value.errors);
          } else {
            const error: ProcessingError = {
              fileName: 'unknown',
              error: result.reason?.message || 'Unknown error during file processing',
              timestamp: new Date(),
              severity: 'critical'
            };
            allErrors.push(error);
            this.handleError(error);
          }
        }

        this.currentProgress.processedFiles = Math.min(i + maxConcurrentFiles, fileInfos.length);
        this.updateProgress();
      }

      const processingTime = Date.now() - startTime;
      this.currentProgress.isComplete = true;
      this.currentProgress.estimatedTimeRemaining = 0;
      this.updateProgress();

      // Store all entries in database if we have any
      if (allEntries.length > 0) {
        console.log(`Storing ${allEntries.length} log entries in database...`);
        await this.storeEntries(allEntries);
      }

      const allErrorsIncludingProgress = [...allErrors, ...this.currentProgress.errors];
      const hasCriticalErrors = allErrorsIncludingProgress.filter(e => e.severity === 'critical').length > 0;
      const hasNonSkippableErrors = !skipMalformedLines && allErrorsIncludingProgress.filter(e => e.severity === 'error').length > 0;
      
      const result: ProcessingResult = {
        success: !this.shouldCancel && !hasCriticalErrors && !hasNonSkippableErrors,
        totalFiles: fileInfos.length,
        processedFiles: this.currentProgress.processedFiles,
        totalLines: this.currentProgress.totalLines,
        successfullyParsed: this.currentProgress.successfullyParsed,
        failedLines: this.currentProgress.failedLines,
        entries: allEntries,
        errors: allErrorsIncludingProgress,
        processingTime
      };

      return result;

    } catch (error) {
      const processingError: ProcessingError = {
        fileName: 'system',
        error: error instanceof Error ? error.message : 'Unknown system error',
        timestamp: new Date(),
        severity: 'critical'
      };
      
      this.handleError(processingError);
      
      return {
        success: false,
        totalFiles: filePaths.length,
        processedFiles: 0,
        totalLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        entries: [],
        errors: [processingError],
        processingTime: Date.now() - startTime
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Validate log format by checking the first few lines
   */
  async validateLogFormat(filePath: string): Promise<boolean> {
    try {
      const fileInfo = await this.getFileInfo(filePath);
      const stream = await this.createReadStream(fileInfo);
      const rl = createInterface({ input: stream });

      let lineCount = 0;
      let validLines = 0;
      const maxLinesToCheck = 10;

      for await (const line of rl) {
        if (lineCount >= maxLinesToCheck) break;
        
        const result = this.parser.parseEntry(line.trim());
        if (result.success) {
          validLines++;
        }
        lineCount++;
      }

      rl.close();
      stream.destroy();

      // Consider format valid if at least 50% of checked lines are valid
      return lineCount > 0 && (validLines / lineCount) >= 0.5;

    } catch (error) {
      return false;
    }
  }

  /**
   * Handle malformed entries
   */
  handleMalformedEntries(entry: string, error: Error, fileName: string, lineNumber: number): void {
    const processingError: ProcessingError = {
      fileName,
      lineNumber,
      error: `Malformed entry: ${error.message}`,
      timestamp: new Date(),
      severity: 'warning'
    };

    this.currentProgress.errors.push(processingError);
    this.currentProgress.failedLines++;
    this.handleError(processingError);
  }

  /**
   * Get current processing progress
   */
  getProcessingProgress(): ProcessingProgress {
    return { ...this.currentProgress };
  }

  /**
   * Cancel current processing
   */
  cancelProcessing(): void {
    this.shouldCancel = true;
  }

  /**
   * Process a single file
   */
  private async processFile(fileInfo: FileInfo, batchSize: number, skipMalformedLines: boolean): Promise<{ entries: ParsedLogEntry[]; errors: ProcessingError[] }> {
    const entries: ParsedLogEntry[] = [];
    const errors: ProcessingError[] = [];
    
    this.currentProgress.currentFile = fileInfo.name;
    this.updateProgress();

    try {
      const stream = await this.createReadStream(fileInfo);
      const rl = createInterface({ input: stream });

      let lineNumber = 0;
      let processedBytes = 0;
      let batch: ParsedLogEntry[] = [];

      for await (const line of rl) {
        if (this.shouldCancel) {
          break;
        }

        lineNumber++;
        processedBytes += Buffer.byteLength(line, 'utf8') + 1; // +1 for newline
        
        this.currentProgress.totalLines++;
        this.currentProgress.processedLines++;
        this.currentProgress.processedBytes += Buffer.byteLength(line, 'utf8') + 1;

        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue; // Skip empty lines
        }

        const result = this.parser.parseEntry(trimmedLine);
        
        if (result.success && result.entry) {
          batch.push(result.entry);
          this.currentProgress.successfullyParsed++;
          
          // Process batch when it reaches the specified size
          if (batch.length >= batchSize) {
            entries.push(...batch);
            batch = [];
          }
        } else {
          if (skipMalformedLines) {
            this.handleMalformedEntries(trimmedLine, new Error(result.error || 'Unknown parsing error'), fileInfo.name, lineNumber);
          } else {
            const error: ProcessingError = {
              fileName: fileInfo.name,
              lineNumber,
              error: result.error || 'Unknown parsing error',
              timestamp: new Date(),
              severity: 'error'
            };
            errors.push(error);
            this.currentProgress.errors.push(error);
            this.currentProgress.failedLines++;
            this.handleError(error);
          }
        }

        // Update progress periodically
        if (lineNumber % 100 === 0) {
          this.updateProgress();
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        entries.push(...batch);
      }

      rl.close();
      stream.destroy();

    } catch (error) {
      const processingError: ProcessingError = {
        fileName: fileInfo.name,
        error: `File processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        severity: 'critical'
      };
      errors.push(processingError);
      this.handleError(processingError);
    }

    return { entries, errors };
  }

  /**
   * Process file content from a buffer (for S3 files)
   */
  private async processFileBuffer(fileBuffer: Buffer, fileName: string, batchSize: number, skipMalformedLines: boolean): Promise<{ entries: ParsedLogEntry[]; errors: ProcessingError[] }> {
    const entries: ParsedLogEntry[] = [];
    const errors: ProcessingError[] = [];
    
    this.currentProgress.currentFile = fileName;
    this.updateProgress();

    try {
      // Handle compressed files
      let content: string;
      if (fileName.endsWith('.gz') || fileName.endsWith('.gzip')) {
        const decompressed = zlib.gunzipSync(fileBuffer);
        content = decompressed.toString('utf8');
      } else {
        content = fileBuffer.toString('utf8');
      }

      const lines = content.split('\n');
      let batch: ParsedLogEntry[] = [];

      for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        if (this.shouldCancel) {
          break;
        }

        const line = lines[lineNumber];
        const trimmedLine = line.trim();
        
        if (!trimmedLine) {
          continue; // Skip empty lines
        }

        this.currentProgress.totalLines++;
        this.currentProgress.processedLines++;
        this.currentProgress.processedBytes += Buffer.byteLength(line, 'utf8') + 1;

        const result = this.parser.parseEntry(trimmedLine);
        
        if (result.success && result.entry) {
          batch.push(result.entry);
          this.currentProgress.successfullyParsed++;
          
          // Process batch when it reaches the specified size
          if (batch.length >= batchSize) {
            entries.push(...batch);
            batch = [];
          }
        } else {
          if (skipMalformedLines) {
            this.handleMalformedEntries(trimmedLine, new Error(result.error || 'Unknown parsing error'), fileName, lineNumber + 1);
          } else {
            const error: ProcessingError = {
              fileName: fileName,
              lineNumber: lineNumber + 1,
              error: result.error || 'Unknown parsing error',
              timestamp: new Date(),
              severity: 'error'
            };
            errors.push(error);
            this.currentProgress.errors.push(error);
            this.currentProgress.failedLines++;
            this.handleError(error);
          }
        }

        // Update progress periodically
        if (lineNumber % 100 === 0) {
          this.updateProgress();
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        entries.push(...batch);
      }

    } catch (error) {
      const processingError: ProcessingError = {
        fileName: fileName,
        error: `Buffer processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        severity: 'critical'
      };
      errors.push(processingError);
      this.handleError(processingError);
    }

    return { entries, errors };
  }

  /**
   * Get file information including compression detection
   */
  private async getFileInfos(filePaths: string[]): Promise<FileInfo[]> {
    const fileInfos: FileInfo[] = [];
    
    for (const filePath of filePaths) {
      const info = await this.getFileInfo(filePath);
      fileInfos.push(info);
    }
    
    return fileInfos;
  }

  /**
   * Get information about a single file
   */
  private async getFileInfo(filePath: string): Promise<FileInfo> {
    const stats = await fs.promises.stat(filePath);
    const fileName = path.basename(filePath);
    const isCompressed = fileName.endsWith('.gz') || fileName.endsWith('.gzip');

    return {
      path: filePath,
      name: fileName,
      size: stats.size,
      isCompressed,
      encoding: 'utf8'
    };
  }

  /**
   * Create appropriate read stream (compressed or uncompressed)
   */
  private async createReadStream(fileInfo: FileInfo): Promise<ReadStream | Transform> {
    const fileStream = createReadStream(fileInfo.path);
    
    if (fileInfo.isCompressed) {
      const gunzip = zlib.createGunzip();
      fileStream.pipe(gunzip);
      return gunzip;
    }
    
    return fileStream;
  }

  /**
   * Initialize progress tracking
   */
  private initializeProgress(): ProcessingProgress {
    return {
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      totalBytes: 0,
      processedBytes: 0,
      totalLines: 0,
      processedLines: 0,
      successfullyParsed: 0,
      failedLines: 0,
      estimatedTimeRemaining: 0,
      errors: [],
      startTime: new Date(),
      isComplete: false
    };
  }

  /**
   * Update progress and call callback if provided
   */
  private updateProgress(): void {
    // Calculate estimated time remaining
    if (this.currentProgress.processedBytes > 0 && this.currentProgress.totalBytes > 0) {
      const elapsedTime = Date.now() - this.currentProgress.startTime.getTime();
      const bytesPerMs = this.currentProgress.processedBytes / elapsedTime;
      const remainingBytes = this.currentProgress.totalBytes - this.currentProgress.processedBytes;
      this.currentProgress.estimatedTimeRemaining = Math.round(remainingBytes / bytesPerMs);
    }

    // Calculate progress percentage
    const progressPercent = this.currentProgress.totalBytes > 0 
      ? (this.currentProgress.processedBytes / this.currentProgress.totalBytes) * 100 
      : 0;

    // Send WebSocket update
    if (this.wsServer) {
      const message = this.currentProgress.currentFile 
        ? `Processing ${this.currentProgress.currentFile}: ${this.currentProgress.successfullyParsed} entries`
        : `Processed ${this.currentProgress.successfullyParsed} entries`;
      
      this.wsServer.sendFileProcessingProgress(progressPercent, message, {
        processedFiles: this.currentProgress.processedFiles,
        totalFiles: this.currentProgress.totalFiles,
        processedEntries: this.currentProgress.successfullyParsed,
        processedBytes: this.currentProgress.processedBytes,
        totalBytes: this.currentProgress.totalBytes,
        currentFile: this.currentProgress.currentFile,
        estimatedTimeRemaining: this.currentProgress.estimatedTimeRemaining
      });
    }

    if (this.progressCallback) {
      this.progressCallback({ ...this.currentProgress });
    }
  }

  /**
   * Handle errors and call error callback if provided
   */
  private handleError(error: ProcessingError): void {
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  /**
   * Store parsed log entries in the database
   */
  private async storeEntries(entries: ParsedLogEntry[]): Promise<void> {
    try {
      const config = getDatabaseConfig();
      const connectionFactory = ConnectionFactory.getInstance();
      const connectionPool = await connectionFactory.createPool(config);
      const dataStore = new SqliteDataStore(connectionPool);
      await dataStore.store(entries);
      console.log(`Successfully stored ${entries.length} log entries in database`);
    } catch (error) {
      console.error('Failed to store entries in database:', error);
      throw error;
    }
  }

  /**
   * Load and process S3 log files
   */
  async loadS3Files(s3Objects: any[], credentials: any, options: ProcessingOptions = {}): Promise<ProcessingResult> {
    if (this.isProcessing) {
      throw new Error('Processing already in progress. Cancel current processing before starting new one.');
    }

    this.isProcessing = true;
    this.shouldCancel = false;
    this.progressCallback = options.progressCallback;
    this.errorCallback = options.errorCallback;

    const startTime = Date.now();
    const batchSize = options.batchSize || 1000;

    try {
      // Initialize progress
      this.currentProgress = {
        ...this.initializeProgress(),
        totalFiles: s3Objects.length,
        totalBytes: s3Objects.reduce((sum: number, obj: any) => sum + obj.size, 0),
        startTime: new Date()
      };

      const allEntries: ParsedLogEntry[] = [];
      const allErrors: ProcessingError[] = [];

      // Import S3IntegrationService for downloading files
      const { S3IntegrationService } = await import('../s3/S3IntegrationService');
      const s3Service = new S3IntegrationService();

      // Process each S3 object
      for (const s3Object of s3Objects) {
        if (this.shouldCancel) {
          break;
        }

        this.currentProgress.currentFile = s3Object.key;
        console.log(`Processing S3 file: ${s3Object.bucket}/${s3Object.key}`);

        try {
          // Download the file from S3
          console.log(`Debug: About to download object - bucket: ${s3Object.bucket}, key: ${s3Object.key}`);
          const fileBuffer = await s3Service.downloadObject(s3Object.bucket, s3Object.key, credentials);
          
          // Process the file content
          const { entries, errors } = await this.processFileBuffer(
            fileBuffer, 
            s3Object.key, 
            batchSize, 
            options.skipMalformedLines !== false
          );

          allEntries.push(...entries);
          allErrors.push(...errors);

          this.currentProgress.processedFiles++;
          this.currentProgress.processedBytes += s3Object.size;
          this.currentProgress.successfullyParsed += entries.length;
          this.currentProgress.failedLines += errors.length;

        } catch (error) {
          const processingError: ProcessingError = {
            fileName: s3Object.key,
            error: error instanceof Error ? error.message : 'Unknown processing error',
            timestamp: new Date(),
            severity: 'error'
          };
          
          allErrors.push(processingError);
          this.handleError(processingError);
        }

        this.updateProgress();
      }

      // Store all entries in database if we have any
      if (allEntries.length > 0) {
        console.log(`Storing ${allEntries.length} log entries in database...`);
        await this.storeEntries(allEntries);
      }

      this.currentProgress.isComplete = true;
      this.updateProgress();

      return {
        success: true,
        totalFiles: s3Objects.length,
        processedFiles: this.currentProgress.processedFiles,
        totalLines: this.currentProgress.totalLines,
        successfullyParsed: this.currentProgress.successfullyParsed,
        failedLines: this.currentProgress.failedLines,
        entries: allEntries,
        errors: allErrors,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      const processingError: ProcessingError = {
        fileName: 'S3 Processing',
        error: error instanceof Error ? error.message : 'Unknown S3 processing error',
        timestamp: new Date(),
        severity: 'critical'
      };

      return {
        success: false,
        totalFiles: s3Objects.length,
        processedFiles: this.currentProgress.processedFiles,
        totalLines: this.currentProgress.totalLines,
        successfullyParsed: this.currentProgress.successfullyParsed,
        failedLines: this.currentProgress.failedLines,
        entries: [],
        errors: [processingError],
        processingTime: Date.now() - startTime
      };
    } finally {
      this.isProcessing = false;
    }
  }
}