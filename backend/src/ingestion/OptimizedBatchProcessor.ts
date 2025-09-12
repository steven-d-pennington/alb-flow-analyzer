import { EventEmitter } from 'events';
import { LocalFileManager } from '../downloads/LocalFileManager';
import { DownloadService } from '../downloads/DownloadService';
import { ConnectionPool } from '../database/types';
import { ALBLogParser } from '../parser/LogParser';
import { ALBWebSocketServer } from '../websocket/WebSocketServer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';

export interface OptimizedProcessingOptions {
  batchId: string;
  processImmediately?: boolean;
  deleteAfterProcessing?: boolean;
  forceReprocess?: boolean;
  batchSize?: number; // Number of records to insert at once
  parallelFiles?: number; // Number of files to process in parallel
}

export interface ProcessingResult {
  batchId: string;
  filesProcessed: number;
  recordsProcessed: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
  throughput: number; // records per second
}

export class OptimizedBatchProcessor extends EventEmitter {
  private localFileManager: LocalFileManager;
  private downloadService: DownloadService;
  private connectionPool: ConnectionPool;
  private logParser: ALBLogParser;
  private webSocketServer: ALBWebSocketServer | null;
  private activeProcessing = new Map<string, boolean>();

  // Optimization settings
  private readonly DEFAULT_BATCH_SIZE = 1000; // Insert 1000 records at once
  private readonly DEFAULT_PARALLEL_FILES = 4; // Process 4 files in parallel
  private readonly PROGRESS_UPDATE_INTERVAL = 5000; // Update progress every 5000 records

  constructor(
    localFileManager: LocalFileManager,
    downloadService: DownloadService,
    connectionPool: ConnectionPool,
    webSocketServer: ALBWebSocketServer | null
  ) {
    super();
    this.localFileManager = localFileManager;
    this.downloadService = downloadService;
    this.connectionPool = connectionPool;
    this.logParser = new ALBLogParser();
    this.webSocketServer = webSocketServer;
  }

  /**
   * Process a downloaded batch with optimizations
   */
  async processBatch(options: OptimizedProcessingOptions): Promise<ProcessingResult> {
    const { 
      batchId, 
      deleteAfterProcessing = false, 
      forceReprocess = false,
      batchSize = this.DEFAULT_BATCH_SIZE,
      parallelFiles = this.DEFAULT_PARALLEL_FILES
    } = options;
    
    if (this.activeProcessing.has(batchId)) {
      throw new Error('Batch is already being processed');
    }

    const startTime = new Date();
    const errors: string[] = [];
    let filesProcessed = 0;
    let recordsProcessed = 0;

    this.activeProcessing.set(batchId, true);

    try {
      console.log(`🚀 Starting optimized processing for batch ${batchId} (${batchSize} records/batch, ${parallelFiles} parallel files)`);

      // Get batch information
      const batch = await this.localFileManager.getBatch(batchId);
      if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
      }

      // Get batch files
      const batchFiles = await this.localFileManager.getBatchFiles(batchId);
      const totalFiles = batchFiles.length;
      console.log(`📁 Processing ${totalFiles} files`);

      // Update batch status to processing
      await this.localFileManager.updateBatchStatus(batchId, 'processing' as any);

      // Process files in chunks for parallel processing
      const chunks = this.chunkArray(batchFiles, parallelFiles);
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        if (chunkIndex % 10 === 0 || chunks.length < 10) {
          console.log(`🔄 Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} files)`);
        }

        // Process chunk in parallel
        const chunkPromises = chunk.map(async (file, fileIndex) => {
          const globalFileIndex = chunkIndex * parallelFiles + fileIndex;
          return this.processFile(file, globalFileIndex, totalFiles, batchId, batchSize);
        });

        const chunkResults = await Promise.all(chunkPromises);
        
        // Aggregate results
        for (const result of chunkResults) {
          if (result.success) {
            filesProcessed++;
            recordsProcessed += result.recordCount;
          } else {
            errors.push(result.error || 'Unknown error');
          }
        }

        // Send progress update after each chunk
        if (this.webSocketServer) {
          this.webSocketServer.broadcastProgress({
            type: 'processing',
            status: 'processing',
            progress: Math.round((filesProcessed / totalFiles) * 100),
            message: `Processed ${filesProcessed}/${totalFiles} files (${recordsProcessed.toLocaleString()} records)`,
            data: { 
              batchId,
              filesProcessed,
              totalFiles,
              recordsProcessed
            }
          });
        }
      }

      // Update batch status to processed
      await this.localFileManager.updateBatchStatus(batchId, 'processed' as any);

      // Delete files if requested
      if (deleteAfterProcessing) {
        await this.localFileManager.deleteBatch(batchId, true);
      }

      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      const throughput = Math.round(recordsProcessed / duration);

      console.log(`✅ Processing completed:`);
      console.log(`   Files: ${filesProcessed}/${totalFiles}`);
      console.log(`   Records: ${recordsProcessed.toLocaleString()}`);
      console.log(`   Duration: ${duration.toFixed(1)}s`);
      console.log(`   Throughput: ${throughput.toLocaleString()} records/sec`);
      console.log(`   Errors: ${errors.length}`);

      // Send completion notification
      if (this.webSocketServer) {
        this.webSocketServer.broadcastProgress({
          type: 'processing',
          status: 'completed',
          progress: 100,
          message: `Processing completed: ${filesProcessed} files, ${recordsProcessed.toLocaleString()} records in ${duration.toFixed(1)}s (${throughput.toLocaleString()} records/sec)`,
          data: {
            batchId,
            filesProcessed,
            recordsProcessed,
            errors,
            duration,
            throughput
          }
        });
      }

      return {
        batchId,
        filesProcessed,
        recordsProcessed,
        errors,
        startTime,
        endTime,
        duration,
        throughput
      };

    } catch (error) {
      await this.handleProcessingError(batchId, error);
      throw error;
    } finally {
      this.activeProcessing.delete(batchId);
    }
  }

  /**
   * Process a single file with batch inserts
   */
  private async processFile(
    file: any, 
    fileIndex: number, 
    totalFiles: number, 
    batchId: string, 
    batchSize: number
  ): Promise<{ success: boolean; recordCount: number; error?: string }> {
    try {
      const fileName = path.basename(file.localPath);
      // Only log every 50th file to reduce noise
      if (fileIndex % 50 === 0 || fileIndex < 5) {
        console.log(`  📄 Processing file ${fileIndex + 1}/${totalFiles}: ${fileName}`);
      }

      // Read and decompress file
      let fileContent: string;
      if (fileName.endsWith('.gz') || fileName.endsWith('.gzip')) {
        const fileBuffer = await fs.readFile(file.localPath);
        const decompressed = zlib.gunzipSync(fileBuffer);
        fileContent = decompressed.toString('utf-8');
      } else {
        fileContent = await fs.readFile(file.localPath, 'utf-8');
      }
      
      const lines = fileContent.split('\n').filter(line => line.trim());
      if (fileIndex % 50 === 0 || fileIndex < 5) {
        console.log(`    📊 Found ${lines.length} log entries`);
      }

      // Parse all lines first
      const parsedRecords = [];
      for (const line of lines) {
        try {
          const result = this.logParser.parseEntry(line);
          if (result.success && result.entry) {
            parsedRecords.push(result.entry);
          }
        } catch (error) {
          console.warn(`Failed to parse line: ${error}`);
        }
      }

      // Store in batches for better performance
      if (parsedRecords.length > 0) {
        await this.storeRecordsInBatches(parsedRecords, batchSize);
      }

      return { success: true, recordCount: parsedRecords.length };

    } catch (error) {
      const errorMsg = `Failed to process file ${file.localPath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      return { success: false, recordCount: 0, error: errorMsg };
    }
  }

  /**
   * Store records in batches with transactions for maximum performance
   */
  private async storeRecordsInBatches(records: any[], batchSize: number): Promise<void> {
    const connection = await this.connectionPool.acquire();
    
    try {
      // Use transaction for better performance
      await connection.execute('BEGIN TRANSACTION');
      
      // Prepare the insert statement
      const query = `
        INSERT INTO log_entries (
          timestamp, client_ip, target_ip, request_processing_time, target_processing_time,
          response_processing_time, elb_status_code, target_status_code, received_bytes,
          sent_bytes, request_verb, request_url, request_protocol, user_agent, ssl_cipher, 
          ssl_protocol, target_group_arn, trace_id, domain_name, chosen_cert_arn, 
          matched_rule_priority, request_creation_time, actions_executed, redirect_url, 
          error_reason, target_port_list, target_status_code_list, classification,
          classification_reason, connection_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Process records in batches
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        // Use prepared statement for each batch
        for (const record of batch) {
          const values = [
            record.timestamp,
            record.clientIp,
            record.targetIp,
            record.requestProcessingTime || 0,
            record.targetProcessingTime || 0,
            record.responseProcessingTime || 0,
            record.elbStatusCode || 0,
            record.targetStatusCode || 0,
            record.receivedBytes || 0,
            record.sentBytes || 0,
            record.requestVerb || '',
            record.requestUrl || '',
            record.requestProtocol || '',
            record.userAgent || '',
            record.sslCipher || '',
            record.sslProtocol || '',
            record.targetGroupArn || '',
            record.traceId || '',
            record.domainName || '',
            record.chosenCertArn || '',
            record.matchedRulePriority || 0,
            record.requestCreationTime || '',
            record.actionsExecuted || '',
            record.redirectUrl || '',
            record.errorReason || '',
            record.targetPortList || '',
            record.targetStatusCodeList || '',
            record.classification || '',
            record.classificationReason || '',
            record.connectionId || ''
          ];
          
          await connection.execute(query, values);
        }
        
        // Only log every few batches to reduce noise
        if (i === 0 || (i + batchSize) >= records.length || i % (batchSize * 5) === 0) {
          console.log(`    💾 Inserted batch of ${batch.length} records (${i + batch.length}/${records.length})`);
        }
      }
      
      // Commit transaction
      await connection.execute('COMMIT');
      
    } catch (error) {
      // Rollback on error
      await connection.execute('ROLLBACK');
      throw error;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Handle processing errors
   */
  private async handleProcessingError(batchId: string, error: any): Promise<void> {
    await this.localFileManager.updateBatchStatus(batchId, 'error' as any, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    if (this.webSocketServer) {
      this.webSocketServer.broadcastProgress({
        type: 'processing',
        status: 'error',
        progress: 0,
        message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { batchId }
      });
    }
  }

  /**
   * Utility function to chunk array for parallel processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get processing status for a batch
   */
  async getProcessingStatus(batchId: string): Promise<any> {
    const batch = await this.localFileManager.getBatch(batchId);
    const isProcessing = this.activeProcessing.has(batchId);
    
    return {
      batchId,
      status: batch?.status || 'unknown',
      isProcessing,
      canProcess: batch?.status === 'completed' && !isProcessing
    };
  }

  /**
   * Process all pending batches
   */
  async processAllPending(): Promise<ProcessingResult[]> {
    const batches = await this.localFileManager.getAllBatches('completed');
    const results: ProcessingResult[] = [];

    for (const batch of batches) {
      try {
        const result = await this.processBatch({
          batchId: batch.batchId,
          processImmediately: true
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to process batch ${batch.batchId}:`, error);
      }
    }

    return results;
  }
}