import { EventEmitter } from 'events';
import { LocalFileManager } from '../downloads/LocalFileManager';
import { DownloadService } from '../downloads/DownloadService';
import { ConnectionPool } from '../database/types';
import { ALBLogParser } from '../parser/LogParser';
import { ALBWebSocketServer } from '../websocket/WebSocketServer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';

export interface ProcessingOptions {
  batchId: string;
  processImmediately?: boolean;
  deleteAfterProcessing?: boolean;
  forceReprocess?: boolean;
}

export interface ProcessingResult {
  batchId: string;
  filesProcessed: number;
  recordsProcessed: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

export class BatchProcessingService extends EventEmitter {
  private localFileManager: LocalFileManager;
  private downloadService: DownloadService;
  private connectionPool: ConnectionPool;
  private logParser: ALBLogParser;
  private webSocketServer: ALBWebSocketServer | null;
  private activeProcessing = new Map<string, boolean>();

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

    // Listen for download completion events
    this.downloadService.on('downloadComplete', this.handleDownloadComplete.bind(this));
  }

  /**
   * Handle download completion and optionally start processing
   */
  private async handleDownloadComplete(batchId: string) {
    console.log(`Download completed for batch ${batchId}`);
    
    // Check if auto-processing is enabled
    const autoProcess = process.env.AUTO_PROCESS_AFTER_DOWNLOAD === 'true';
    
    if (autoProcess) {
      await this.processBatch({
        batchId,
        processImmediately: true,
        deleteAfterProcessing: false
      });
    } else {
      // Send notification that download is complete and ready for processing
      if (this.webSocketServer) {
        this.webSocketServer.broadcastProgress({
          type: 'notification',
          status: 'ready',
          message: `Batch ${batchId} is ready for processing`,
          data: { batchId }
        });
      }
    }
  }

  /**
   * Process a downloaded batch
   */
  async processBatch(options: ProcessingOptions): Promise<ProcessingResult> {
    const { batchId, deleteAfterProcessing = false, forceReprocess = false } = options;
    
    if (this.activeProcessing.has(batchId)) {
      throw new Error('Batch is already being processed');
    }

    const startTime = new Date();
    const errors: string[] = [];
    let filesProcessed = 0;
    let recordsProcessed = 0;

    this.activeProcessing.set(batchId, true);

    try {
      // Get batch information
      const batch = await this.localFileManager.getBatch(batchId);
      if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
      }

      if (batch.status !== 'completed' && !forceReprocess) {
        throw new Error(`Batch ${batchId} is not ready for processing (status: ${batch.status})`);
      }
      
      // For force reprocess, allow processing of completed, processed, or error status batches
      if (forceReprocess && !['completed', 'processed', 'error'].includes(batch.status)) {
        throw new Error(`Batch ${batchId} cannot be reprocessed (status: ${batch.status})`);
      }

      // Verify files exist
      const filesExist = await this.localFileManager.verifyBatchFiles(batchId);
      if (!filesExist) {
        throw new Error('Batch files are missing or corrupted');
      }

      // Get batch files
      const batchFiles = await this.localFileManager.getBatchFiles(batchId);
      const totalFiles = batchFiles.length;

      // Update batch status to processing
      await this.localFileManager.updateBatchStatus(batchId, 'processing' as any);

      // Process each file
      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        
        try {
          // Send progress update
          if (this.webSocketServer) {
            this.webSocketServer.broadcastProgress({
              type: 'processing',
              status: 'processing',
              progress: Math.round((i / totalFiles) * 100),
              message: `Processing file ${i + 1}/${totalFiles}: ${path.basename(file.localPath)}`,
              data: { 
                batchId,
                currentFile: file.localPath,
                fileIndex: i,
                totalFiles
              }
            });
          }

          // Read and parse the file - handle gzip if needed
          const fileName = path.basename(file.localPath);
          let fileContent: string;
          
          if (fileName.endsWith('.gz') || fileName.endsWith('.gzip')) {
            console.log(`Decompressing gzipped file: ${fileName}`);
            const fileBuffer = await fs.readFile(file.localPath);
            const decompressed = zlib.gunzipSync(fileBuffer);
            fileContent = decompressed.toString('utf-8');
          } else {
            fileContent = await fs.readFile(file.localPath, 'utf-8');
          }
          
          const lines = fileContent.split('\n').filter(line => line.trim());
          
          // Parse each line
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

          // Store parsed records in database
          if (parsedRecords.length > 0) {
            await this.storeRecords(parsedRecords);
            recordsProcessed += parsedRecords.length;
          }

          filesProcessed++;
          
        } catch (error) {
          const errorMsg = `Failed to process file ${file.localPath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // Update batch status to processed
      await this.localFileManager.updateBatchStatus(batchId, 'processed' as any);

      // Delete files if requested
      if (deleteAfterProcessing) {
        await this.localFileManager.deleteBatch(batchId, true);
      }

      // Send completion notification
      if (this.webSocketServer) {
        this.webSocketServer.broadcastProgress({
          type: 'processing',
          status: 'completed',
          progress: 100,
          message: `Processing completed: ${filesProcessed} files, ${recordsProcessed} records`,
          data: {
            batchId,
            filesProcessed,
            recordsProcessed,
            errors
          }
        });
      }

    } catch (error) {
      // Update batch status to error
      await this.localFileManager.updateBatchStatus(batchId, 'error' as any, {
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send error notification
      if (this.webSocketServer) {
        this.webSocketServer.broadcastProgress({
          type: 'processing',
          status: 'error',
          progress: 0,
          message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          data: { batchId }
        });
      }

      throw error;

    } finally {
      this.activeProcessing.delete(batchId);
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;

    return {
      batchId,
      filesProcessed,
      recordsProcessed,
      errors,
      startTime,
      endTime,
      duration
    };
  }

  /**
   * Store parsed records in the database
   */
  private async storeRecords(records: any[]): Promise<void> {
    const connection = await this.connectionPool.acquire();
    
    try {
      // Prepare batch insert with CORRECTED field mapping
      const values = records.map(record => [
        record.timestamp,
        record.clientIp, // FIXED: was record.client
        record.targetIp, // FIXED: was record.target  
        record.requestProcessingTime || 0,
        record.targetProcessingTime || 0,
        record.responseProcessingTime || 0,
        record.elbStatusCode || 0,
        record.targetStatusCode || 0,
        record.receivedBytes || 0,
        record.sentBytes || 0,
        record.requestVerb || '', // FIXED: was record.request
        record.requestUrl || '', // FIXED: was missing
        record.requestProtocol || '', // FIXED: was missing
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
      ]);

      // SQLite batch insert - insert each record individually
      const query = `
        INSERT INTO log_entries (
          timestamp, client_ip, target_ip, request_processing_time, target_processing_time,
          response_processing_time, elb_status_code, target_status_code, received_bytes,
          sent_bytes, request_verb, request_url, request_protocol, user_agent, ssl_cipher, ssl_protocol, target_group_arn,
          trace_id, domain_name, chosen_cert_arn, matched_rule_priority,
          request_creation_time, actions_executed, redirect_url, error_reason,
          target_port_list, target_status_code_list, classification,
          classification_reason, connection_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Execute each record individually for SQLite
      for (const recordValues of values) {
        await connection.execute(query, recordValues);
      }
      
    } finally {
      await this.connectionPool.release(connection);
    }
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