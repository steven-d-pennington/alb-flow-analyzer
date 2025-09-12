import { ConnectionPool } from '../database/types';
import { 
  DownloadBatch, 
  DownloadStatus, 
  BatchSummary, 
  LocalFileInfo 
} from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class LocalFileManager {
  private connection: ConnectionPool;
  private tempDirectory: string;

  constructor(connection: ConnectionPool, tempDirectory = './temp/downloads') {
    this.connection = connection;
    this.tempDirectory = tempDirectory;
  }

  /**
   * Create a new download batch
   */
  async createBatch(batch: DownloadBatch): Promise<void> {
    console.log('Creating batch with data:', {
      batchId: batch.batchId,
      fileCount: batch.fileCount,
      estimatedSizeBytes: batch.estimatedSizeBytes,
      status: batch.status,
      s3FilePathsLength: batch.s3FilePaths.length
    });

    const query = `
      INSERT INTO download_batches (
        batch_id, batch_name, download_date, file_count, total_size_bytes,
        s3_file_paths, local_file_paths, status, estimated_size_bytes,
        progress_percentage, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      batch.batchId,
      batch.batchName,
      batch.downloadDate.toISOString(),
      batch.fileCount,
      batch.totalSizeBytes,
      JSON.stringify(batch.s3FilePaths),
      JSON.stringify(batch.localFilePaths),
      batch.status,
      batch.estimatedSizeBytes,
      batch.progressPercentage,
      batch.createdAt.toISOString(),
      batch.updatedAt.toISOString()
    ];

    console.log('Executing query with values:', values);

    const conn = await this.connection.acquire();
    try {
      const result = await conn.execute(query, values);
      console.log('Batch created successfully:', result);
    } catch (error) {
      console.error('Failed to create batch:', error);
      throw error;
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Get a download batch by ID
   */
  async getBatch(batchId: string): Promise<DownloadBatch | null> {
    const query = `
      SELECT * FROM download_batches WHERE batch_id = ?
    `;

    const conn = await this.connection.acquire();
    try {
      const result = await conn.query(query, [batchId]);
      console.log('Query result type:', typeof result, Array.isArray(result));
      console.log('Query result:', result);
      
      // Handle different result formats from different database types
      let rows: any[];
      if (result && typeof result === 'object' && 'rows' in result) {
        rows = result.rows;
      } else if (Array.isArray(result)) {
        rows = result;
      } else if (result) {
        rows = [result];
      } else {
        rows = [];
      }

      console.log('Processed rows:', rows);

      if (rows.length === 0) {
        console.log('No batch found for ID:', batchId);
        return null;
      }

      const row = rows[0];
      console.log('Raw database row:', row);
      
      const batch = this.mapRowToBatch(row);
      console.log('Mapped batch:', batch);
      
      return batch;
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Get all download batches with optional filtering
   */
  async getAllBatches(status?: DownloadStatus): Promise<BatchSummary[]> {
    let query = `
      SELECT batch_id, batch_name, file_count, total_size_bytes, status, 
             download_date, created_at
      FROM download_batches
    `;

    const params: any[] = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const conn = await this.connection.acquire();
    try {
      console.log('getAllBatches query:', query, 'params:', params);
      const result = await conn.query(query, params);
      console.log('getAllBatches raw result:', result);
      
      // Handle different result formats from different database types
      let rows: any[];
      if (result && typeof result === 'object' && 'rows' in result) {
        rows = result.rows;
      } else if (Array.isArray(result)) {
        rows = result;
      } else if (result) {
        rows = [result];
      } else {
        rows = [];
      }

      console.log('getAllBatches processed rows:', rows);

      return rows.map(row => {
        console.log('Processing row:', row);
        return {
          batchId: row.batch_id,
          batchName: row.batch_name,
          fileCount: row.file_count,
          totalSizeBytes: row.total_size_bytes,
          status: row.status as DownloadStatus,
          downloadDate: row.download_date ? new Date(row.download_date) : null,
          processingStatus: 'not_processed' // TODO: Determine from processing records
        };
      });
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Update batch status and optional fields
   */
  async updateBatchStatus(
    batchId: string, 
    status: DownloadStatus, 
    updates: Partial<DownloadBatch> = {}
  ): Promise<void> {
    const setFields = ['status = ?', 'updated_at = ?'];
    const values = [status, new Date().toISOString()];

    // Add optional updates
    if (updates.progressPercentage !== undefined) {
      setFields.push('progress_percentage = ?');
      values.push(updates.progressPercentage.toString());
    }

    if (updates.errorMessage !== undefined) {
      setFields.push('error_message = ?');
      values.push(updates.errorMessage);
    }

    if (updates.downloadStartedAt) {
      setFields.push('download_started_at = ?');
      values.push(updates.downloadStartedAt.toISOString());
    }

    if (updates.downloadCompletedAt) {
      setFields.push('download_completed_at = ?');
      values.push(updates.downloadCompletedAt.toISOString());
    }

    if (updates.totalSizeBytes !== undefined) {
      setFields.push('total_size_bytes = ?');
      values.push(updates.totalSizeBytes.toString());
    }

    if (updates.localFilePaths) {
      setFields.push('local_file_paths = ?');
      values.push(JSON.stringify(updates.localFilePaths));
    }

    const query = `
      UPDATE download_batches 
      SET ${setFields.join(', ')}
      WHERE batch_id = ?
    `;

    values.push(batchId);

    const conn = await this.connection.acquire();
    try {
      await conn.execute(query, values);
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Delete a batch and its files
   */
  async deleteBatch(batchId: string, deleteFiles = true): Promise<void> {
    if (deleteFiles) {
      await this.deleteLocalFiles(batchId);
    }

    const query = 'DELETE FROM download_batches WHERE batch_id = ?';
    const conn = await this.connection.acquire();
    try {
      await conn.execute(query, [batchId]);
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Delete local files for a batch
   */
  async deleteLocalFiles(batchId: string): Promise<void> {
    const batchDir = path.join(this.tempDirectory, batchId);
    
    try {
      await fs.rm(batchDir, { recursive: true, force: true });
      console.log(`Deleted batch files: ${batchDir}`);
    } catch (error) {
      console.error(`Failed to delete batch files for ${batchId}:`, error);
      throw error;
    }
  }

  /**
   * Get local file info for a batch
   */
  async getBatchFiles(batchId: string): Promise<LocalFileInfo[]> {
    const batch = await this.getBatch(batchId);
    if (!batch) return [];

    const fileInfos: LocalFileInfo[] = [];
    const batchDir = path.join(this.tempDirectory, batchId);

    for (let i = 0; i < batch.localFilePaths.length; i++) {
      const localPath = batch.localFilePaths[i];
      const s3Path = batch.s3FilePaths[i];

      try {
        const stats = await fs.stat(localPath);
        
        fileInfos.push({
          localPath,
          s3Path,
          size: stats.size,
          downloadedAt: stats.mtime
        });
      } catch (error) {
        console.warn(`Failed to get stats for ${localPath}:`, error);
      }
    }

    return fileInfos;
  }

  /**
   * Get batch summary with file details
   */
  async getBatchSummary(batchId: string): Promise<BatchSummary | null> {
    const batch = await this.getBatch(batchId);
    if (!batch) return null;

    return {
      batchId: batch.batchId,
      batchName: batch.batchName,
      fileCount: batch.fileCount,
      totalSizeBytes: batch.totalSizeBytes,
      status: batch.status,
      downloadDate: batch.downloadDate,
      processingStatus: 'not_processed' // TODO: Check processing status
    };
  }

  /**
   * Check if batch files exist locally
   */
  async verifyBatchFiles(batchId: string): Promise<boolean> {
    const batch = await this.getBatch(batchId);
    if (!batch) return false;

    try {
      for (const localPath of batch.localFilePaths) {
        await fs.access(localPath);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    totalBatches: number;
    totalFiles: number;
    totalSizeBytes: number;
    statusBreakdown: Record<DownloadStatus, number>;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_batches,
        SUM(file_count) as total_files,
        SUM(total_size_bytes) as total_size,
        status,
        COUNT(*) as status_count
      FROM download_batches 
      GROUP BY status
    `;

    const conn = await this.connection.acquire();
    try {
      const result = await conn.query(query);
      const rows = Array.isArray(result) ? result : [result];

    const stats = {
      totalBatches: 0,
      totalFiles: 0,
      totalSizeBytes: 0,
      statusBreakdown: {} as Record<DownloadStatus, number>
    };

    for (const row of rows) {
      stats.totalBatches += row.status_count;
      stats.totalFiles += row.total_files || 0;
      stats.totalSizeBytes += row.total_size || 0;
      stats.statusBreakdown[row.status as DownloadStatus] = row.status_count;
    }

      return stats;
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Cleanup old batches (older than specified days)
   */
  async cleanupOldBatches(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const selectQuery = `
      SELECT batch_id FROM download_batches 
      WHERE created_at < ? AND status IN ('completed', 'error', 'cancelled')
    `;

    const conn = await this.connection.acquire();
    try {
      const result = await conn.query(selectQuery, [cutoffDate.toISOString()]);
      const rows = Array.isArray(result) ? result : [result];

      let deletedCount = 0;

      for (const row of rows) {
        try {
          await this.deleteBatch(row.batch_id, true);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to cleanup batch ${row.batch_id}:`, error);
        }
      }

      return deletedCount;
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Map database row to DownloadBatch object
   */
  private mapRowToBatch(row: any): DownloadBatch {
    return {
      batchId: row.batch_id,
      batchName: row.batch_name,
      downloadDate: new Date(row.download_date),
      fileCount: row.file_count,
      totalSizeBytes: row.total_size_bytes,
      s3FilePaths: JSON.parse(row.s3_file_paths || '[]'),
      localFilePaths: JSON.parse(row.local_file_paths || '[]'),
      status: row.status as DownloadStatus,
      errorMessage: row.error_message,
      downloadStartedAt: row.download_started_at ? new Date(row.download_started_at) : undefined,
      downloadCompletedAt: row.download_completed_at ? new Date(row.download_completed_at) : undefined,
      estimatedSizeBytes: row.estimated_size_bytes || 0,
      progressPercentage: row.progress_percentage || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}