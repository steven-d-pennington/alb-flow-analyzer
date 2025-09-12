import { S3 } from 'aws-sdk';
import type { HeadObjectOutput } from 'aws-sdk/clients/s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  DownloadBatch,
  DownloadProgress,
  DownloadRequest,
  DownloadEstimate,
  DownloadServiceConfig,
  DownloadStatus,
  S3FileInfo,
  FileProgress
} from './types';
import { LocalFileManager } from './LocalFileManager';
import { ALBWebSocketServer } from '../websocket/WebSocketServer';

export class DownloadService extends EventEmitter {
  private s3: S3;
  private localFileManager: LocalFileManager;
  private webSocketServer: ALBWebSocketServer | null;
  private config: DownloadServiceConfig;
  private activeDownloads = new Map<string, boolean>();

  constructor(
    s3: S3,
    localFileManager: LocalFileManager,
    webSocketServer: ALBWebSocketServer | null,
    config: Partial<DownloadServiceConfig> = {}
  ) {
    super();
    this.s3 = s3;
    this.localFileManager = localFileManager;
    this.webSocketServer = webSocketServer;
    this.config = {
      tempDirectory: './temp/downloads',
      maxConcurrentDownloads: 5,
      retryAttempts: 3,
      retryDelayMs: 1000,
      resumeSupported: true,
      cleanupOnError: false,
      ...config
    };

    // Ensure temp directory exists
    this.ensureTempDirectory();
  }

  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.access(this.config.tempDirectory);
    } catch {
      await fs.mkdir(this.config.tempDirectory, { recursive: true });
    }
  }

  /**
   * Estimate download size and duration
   */
  async estimateDownload(s3FilePaths: string[]): Promise<DownloadEstimate> {
    console.log(`Estimating download for ${s3FilePaths.length} files...`);
    
    let totalSize = 0;
    const validFiles: S3FileInfo[] = [];

    // Process files with concurrency limit and timeouts
    const processFile = async (s3Path: string) => {
      let bucket = '';
      let key = '';
      
      try {
        const parsed = this.parseS3Path(s3Path);
        bucket = parsed.bucket;
        key = parsed.key;
        
        console.log(`Getting info for ${s3Path} (bucket: ${bucket}, key: ${key})`);
        
        // Add timeout to prevent hanging S3 calls
        const headPromise = this.s3.headObject({
          Bucket: bucket,
          Key: key
        }).promise();
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('S3 headObject timeout after 5 seconds')), 5000);
        });
        
        const headResult = await Promise.race([headPromise, timeoutPromise]) as any;

        const fileInfo: S3FileInfo = {
          key,
          size: headResult.ContentLength || 0,
          lastModified: headResult.LastModified || new Date(),
          etag: headResult.ETag || ''
        };

        return fileInfo;
      } catch (error) {
        console.error(`Failed to get info for ${s3Path}:`, error);
        console.error(`Parsed bucket: ${bucket}, key: ${key}`);
        
        // Check if it's a permission or authentication error
        if (error instanceof Error) {
          console.error(`Error details: ${error.message}`);
          if ('code' in error) {
            console.error(`AWS Error Code: ${(error as any).code}`);
          }
          if ('statusCode' in error) {
            console.error(`Status Code: ${(error as any).statusCode}`);
          }
        }
        
        // For estimate purposes, assume a default file size if we can't get the actual size
        console.log(`Using default size estimate for inaccessible file: ${s3Path}`);
        const defaultFileInfo: S3FileInfo = {
          key,
          size: 1024 * 1024, // Assume 1MB default size
          lastModified: new Date(),
          etag: 'unknown'
        };
        
        return defaultFileInfo;
      }
    };

    // Process files with limited concurrency to avoid overwhelming S3
    const concurrencyLimit = 3;
    for (let i = 0; i < s3FilePaths.length; i += concurrencyLimit) {
      const batch = s3FilePaths.slice(i, i + concurrencyLimit);
      console.log(`Processing batch ${Math.floor(i/concurrencyLimit) + 1}/${Math.ceil(s3FilePaths.length/concurrencyLimit)} (${batch.length} files)`);
      
      const batchResults = await Promise.all(batch.map(processFile));
      
      for (const fileInfo of batchResults) {
        validFiles.push(fileInfo);
        totalSize += fileInfo.size;
      }
    }

    // Estimate duration based on average download speed (5 MB/s)
    const avgSpeedBytesPerSecond = 5 * 1024 * 1024;
    const estimatedSeconds = totalSize / avgSpeedBytesPerSecond;

    return {
      totalFiles: validFiles.length,
      estimatedSizeBytes: totalSize,
      estimatedDurationMinutes: Math.ceil(estimatedSeconds / 60)
    };
  }

  /**
   * Start downloading files
   */
  async startDownload(request: DownloadRequest): Promise<string> {
    const batchId = uuidv4();
    const batchName = request.batchName || `Batch ${new Date().toISOString().slice(0, 16)}`;

    console.log(`Starting download batch ${batchId} with ${request.s3FilePaths.length} files`);
    console.log('S3 file paths:', request.s3FilePaths.slice(0, 3)); // Log first 3 paths

    try {
      // Create batch record without estimating (skip the expensive HEAD requests)
      console.log('Creating batch record...');
      
      const batch: DownloadBatch = {
        batchId,
        batchName,
        downloadDate: new Date(),
        fileCount: request.s3FilePaths.length,
        totalSizeBytes: 0,
        s3FilePaths: request.s3FilePaths,
        localFilePaths: [],
        status: 'pending',
        estimatedSizeBytes: 0, // Will be calculated during download
        progressPercentage: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.localFileManager.createBatch(batch);

      // If estimate only, return batch ID (but we won't estimate)
      if (request.estimateOnly) {
        console.log('Estimate only requested, not starting download');
        return batchId;
      }

      // Start download in background
      console.log('Starting download in background...');
      this.performDownload(batchId).catch(error => {
        console.error(`Background download failed for batch ${batchId}:`, error);
      });

      return batchId;
    } catch (error) {
      console.error('Failed to start download:', error);
      throw new Error(`Failed to start download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform the actual download
   */
  private async performDownload(batchId: string): Promise<void> {
    if (this.activeDownloads.has(batchId)) {
      throw new Error('Download already in progress');
    }

    this.activeDownloads.set(batchId, true);

    try {
      const batch = await this.localFileManager.getBatch(batchId);
      if (!batch) {
        throw new Error('Batch not found');
      }

      // Update status to downloading
      await this.localFileManager.updateBatchStatus(batchId, 'downloading', {
        downloadStartedAt: new Date()
      });

      const localFilePaths: string[] = [];
      let downloadedBytes = 0;
      const totalFiles = batch.s3FilePaths.length;
      
      console.log(`Starting download of ${totalFiles} files with max ${this.config.maxConcurrentDownloads} concurrent downloads`);

      // Track completed files for progress
      let completedFiles = 0;
      let lastProgressUpdate = Date.now();
      const PROGRESS_UPDATE_INTERVAL = 1000; // Update progress every second

      // Simple concurrency control without external dependencies
      const downloadWithConcurrency = async (
        files: string[],
        maxConcurrent: number
      ): Promise<string[]> => {
        const results: string[] = [];
        const executing: Promise<string>[] = [];
        
        for (let i = 0; i < files.length; i++) {
          const s3Path = files[i];
          
          // Create download promise
          const promise = this.downloadSingleFile(batchId, s3Path, i, totalFiles)
            .then(async (localPath) => {
              results.push(localPath);
              completedFiles++;
              
              // Throttle progress updates to avoid WebSocket spam
              const now = Date.now();
              if (now - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL || completedFiles === totalFiles) {
                lastProgressUpdate = now;
                const progressPercentage = Math.round((completedFiles / totalFiles) * 100);
                
                // Update batch progress in database
                await this.localFileManager.updateBatchStatus(batchId, 'downloading', {
                  progressPercentage
                });
                
                // Send throttled WebSocket update
                if (this.webSocketServer) {
                  this.webSocketServer.broadcastProgress({
                    type: 'download',
                    batchId,
                    status: 'downloading',
                    progress: progressPercentage,
                    message: `Downloaded ${completedFiles}/${totalFiles} files (${progressPercentage}%)`
                  });
                }
              }
              
              return localPath;
            })
            .catch((error) => {
              console.error(`Failed to download file ${i + 1}/${totalFiles}: ${s3Path}`, error);
              throw error;
            })
            .finally(() => {
              // Remove from executing array when done
              const index = executing.indexOf(promise);
              if (index !== -1) executing.splice(index, 1);
            });
          
          executing.push(promise);
          
          // If we've reached the concurrency limit, wait for one to finish
          if (executing.length >= maxConcurrent) {
            await Promise.race(executing);
          }
        }
        
        // Wait for all remaining downloads to complete
        await Promise.all(executing);
        return results;
      };

      // Download files with concurrency control
      const downloadedPaths = await downloadWithConcurrency(
        batch.s3FilePaths,
        this.config.maxConcurrentDownloads
      );
      
      localFilePaths.push(...downloadedPaths);

      // Update batch as completed
      await this.localFileManager.updateBatchStatus(batchId, 'completed', {
        downloadCompletedAt: new Date(),
        localFilePaths,
        progressPercentage: 100,
        totalSizeBytes: downloadedBytes
      });

      // Emit completion event
      this.emit('downloadComplete', batchId);
      
      // Send WebSocket update
      if (this.webSocketServer) {
        this.webSocketServer.broadcastProgress({
        type: 'download',
        batchId,
        status: 'completed',
        progress: 100,
        message: `Downloaded ${totalFiles} files successfully`
        });
      }

    } catch (error) {
      console.error(`Download failed for batch ${batchId}:`, error);
      
      await this.localFileManager.updateBatchStatus(batchId, 'error', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        progressPercentage: 0
      });

      // Emit error event
      this.emit('downloadError', batchId, error);

      // Send WebSocket update
      if (this.webSocketServer) {
        this.webSocketServer.broadcastProgress({
        type: 'download',
        batchId,
        status: 'error',
        progress: 0,
        message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }

      if (this.config.cleanupOnError) {
        await this.cleanupBatch(batchId);
      }
    } finally {
      this.activeDownloads.delete(batchId);
    }
  }

  /**
   * Download a single file with retry logic
   */
  private async downloadSingleFile(
    batchId: string,
    s3Path: string,
    fileIndex: number,
    totalFiles: number
  ): Promise<string> {
    const { bucket, key } = this.parseS3Path(s3Path);
    const fileName = path.basename(key);
    const localPath = path.join(this.config.tempDirectory, batchId, fileName);

    // Ensure batch directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    let attempt = 0;
    const maxAttempts = this.config.retryAttempts + 1;

    while (attempt < maxAttempts) {
      try {
        // Get file size once and reuse it
        let totalBytes = 0;
        let headResult: HeadObjectOutput | null = null;
        
        // Check if file already exists and is complete
        if (this.config.resumeSupported) {
          try {
            const stats = await fs.stat(localPath);
            headResult = await this.s3.headObject({ Bucket: bucket, Key: key }).promise();
            totalBytes = headResult.ContentLength || 0;
            
            if (stats.size === totalBytes) {
              console.log(`File ${fileName} already exists and is complete`);
              return localPath;
            }
          } catch {
            // File doesn't exist, continue with download
          }
        }
        
        // Get file size if we haven't already
        if (!headResult) {
          headResult = await this.s3.headObject({ Bucket: bucket, Key: key }).promise();
          totalBytes = headResult.ContentLength || 0;
        }

        // Download file
        const s3Object = this.s3.getObject({ Bucket: bucket, Key: key });
        const stream = s3Object.createReadStream();
        
        // Track progress
        let downloadedBytes = 0;

        stream.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          
          // Progress updates are now handled at the batch level in performDownload
          // to avoid WebSocket spam when downloading thousands of files.
          // Individual file progress is too granular for large batches.
        });

        // Write to file
        const writeStream = (await import('fs')).createWriteStream(localPath);
        stream.pipe(writeStream);

        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', () => resolve());
          writeStream.on('error', reject);
          stream.on('error', reject);
        });

        console.log(`Successfully downloaded ${fileName}`);
        return localPath;

      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt}/${maxAttempts} failed for ${fileName}:`, error);

        if (attempt >= maxAttempts) {
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs * attempt));
      }
    }

    throw new Error(`Failed to download ${fileName} after ${maxAttempts} attempts`);
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(batchId: string): Promise<void> {
    this.activeDownloads.delete(batchId);
    
    await this.localFileManager.updateBatchStatus(batchId, 'cancelled');
    
    this.emit('downloadCancelled', batchId);
    
    if (this.webSocketServer) {
      this.webSocketServer.broadcastProgress({
      type: 'download',
      batchId,
      status: 'cancelled',
      progress: 0,
      message: 'Download cancelled by user'
      });
    }
  }

  /**
   * Clean up batch files
   */
  async cleanupBatch(batchId: string): Promise<void> {
    const batchDir = path.join(this.config.tempDirectory, batchId);
    
    try {
      await fs.rm(batchDir, { recursive: true, force: true });
      console.log(`Cleaned up batch directory: ${batchDir}`);
    } catch (error) {
      console.error(`Failed to cleanup batch ${batchId}:`, error);
    }
  }

  /**
   * Get download progress
   */
  async getDownloadProgress(batchId: string): Promise<DownloadProgress | null> {
    const batch = await this.localFileManager.getBatch(batchId);
    if (!batch) return null;

    console.log(`Download progress for batch ${batchId}:`, {
      status: batch.status,
      fileCount: batch.fileCount,
      totalSizeBytes: batch.totalSizeBytes,
      estimatedSizeBytes: batch.estimatedSizeBytes,
      progressPercentage: batch.progressPercentage,
      isActive: this.activeDownloads.has(batchId)
    });

    return {
      batchId: batch.batchId,
      currentFile: 'N/A',
      fileIndex: 0,
      totalFiles: batch.fileCount,
      downloadedBytes: batch.totalSizeBytes,
      totalBytes: batch.estimatedSizeBytes,
      progressPercentage: batch.progressPercentage,
      status: batch.status
    };
  }

  /**
   * Parse S3 path into bucket and key
   */
  private parseS3Path(s3Path: string): { bucket: string; key: string } {
    const match = s3Path.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid S3 path: ${s3Path}`);
    }
    
    return {
      bucket: match[1],
      key: match[2]
    };
  }

  /**
   * Get active downloads
   */
  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  /**
   * Check if download is active
   */
  isDownloadActive(batchId: string): boolean {
    return this.activeDownloads.has(batchId);
  }
}