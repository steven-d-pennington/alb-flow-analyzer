/**
 * Data access layer with repository pattern for ALB flow log entries
 */

import { DatabaseConnection, ConnectionPool } from './types';

// Data models based on the design document
export interface ParsedLogEntry {
  id?: number;
  timestamp: Date;
  clientIp: string;
  targetIp: string;
  requestProcessingTime: number;
  targetProcessingTime: number;
  responseProcessingTime: number;
  elbStatusCode: number;
  targetStatusCode: number;
  receivedBytes: number;
  sentBytes: number;
  requestVerb: string;
  requestUrl: string;
  requestProtocol: string;
  userAgent: string;
  sslCipher?: string;
  sslProtocol?: string;
  targetGroupArn: string;
  traceId: string;
  domainName: string;
  chosenCertArn?: string;
  matchedRulePriority: number;
  requestCreationTime: Date;
  actionsExecuted: string;
  redirectUrl?: string;
  errorReason?: string;
  targetPortList: string;
  targetStatusCodeList: string;
  classification: string;
  classificationReason: string;
  connectionId?: string;
  createdAt?: Date;
}

export interface FilterCriteria {
  timeRange?: {
    start: Date;
    end: Date;
  };
  endpoints?: string[];
  statusCodes?: number[];
  clientIps?: string[];
  userAgentPatterns?: string[];
  domainNames?: string[];
  limit?: number;
  offset?: number;
  // Performance optimization options
  maxRows?: number; // Hard limit to prevent memory issues
  timeoutMs?: number; // Query timeout in milliseconds
  sortOrder?: 'ASC' | 'DESC';
  sortBy?: string;
}

export interface StorageStats {
  totalEntries: number;
  databaseSize: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  indexCount: number;
  compressionRatio?: number;
}

export interface BatchInsertResult {
  insertedCount: number;
  failedCount: number;
  errors: string[];
  batchSize: number;
  processingTimeMs: number;
}

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
  currentPage: number;
  totalPages: number;
  processingTimeMs: number;
}

export interface QueryOptions {
  batchSize?: number;
  maxBatches?: number;
  timeoutMs?: number;
  useAggregation?: boolean;
  forceIndex?: string;
}

/**
 * DataStore interface for managing ALB flow log entries
 */
export interface DataStore {
  // Core data operations
  store(entries: ParsedLogEntry[]): Promise<BatchInsertResult>;
  storeBatch(entries: ParsedLogEntry[], batchSize?: number): Promise<BatchInsertResult>;
  query(filters?: FilterCriteria, options?: QueryOptions): Promise<ParsedLogEntry[]>;
  queryPaginated(filters?: FilterCriteria, page?: number, pageSize?: number, options?: QueryOptions): Promise<PaginatedResult<ParsedLogEntry>>;
  count(filters?: FilterCriteria): Promise<number>;
  
  // Optimized query methods
  queryStream(callback: (batch: ParsedLogEntry[]) => Promise<void>, filters?: FilterCriteria, batchSize?: number): Promise<void>;
  queryAggregated(filters?: FilterCriteria): Promise<any>;
  queryCursorPaginated(filters?: FilterCriteria, cursor?: string, limit?: number, direction?: 'forward' | 'backward'): Promise<{ data: ParsedLogEntry[]; nextCursor?: string; prevCursor?: string; hasMore: boolean; processingTimeMs: number }>;
  
  // Index management
  createIndex(field: string): Promise<void>;
  dropIndex(indexName: string): Promise<void>;
  listIndexes(): Promise<string[]>;
  optimizeIndexes(): Promise<void>;
  
  // Statistics and monitoring
  getStats(): Promise<StorageStats>;
  getDatabaseSize(): Promise<number>;
  getQueryPerformanceStats(): Promise<any>;
  
  // Data management
  clearData(): Promise<void>;
  deleteOldEntries(olderThan: Date): Promise<number>;
  vacuum(): Promise<void>;
  
  // Download tracking
  getFileCountByPrefix(s3KeyPrefix: string): Promise<number>;
  getLastDownloadTime(s3KeyPrefix: string): Promise<Date | null>;
  
  // Connection management
  close(): Promise<void>;
}
/**

 * SQLite-based implementation of DataStore
 */
export class SqliteDataStore implements DataStore {
  private connectionPool: ConnectionPool;
  private readonly DEFAULT_BATCH_SIZE = 1000;
  private readonly DEFAULT_PAGE_SIZE = 100;
  private readonly MAX_QUERY_ROWS = 50000;
  private readonly DEFAULT_TIMEOUT_MS = 30000;

  constructor(connectionPool: ConnectionPool) {
    this.connectionPool = connectionPool;
  }

  /**
   * Store multiple log entries in batch - uses storeBatch internally
   */
  async store(entries: ParsedLogEntry[]): Promise<BatchInsertResult> {
    return this.storeBatch(entries, this.DEFAULT_BATCH_SIZE);
  }

  /**
   * Store multiple log entries with configurable batch size for optimal performance
   */
  async storeBatch(entries: ParsedLogEntry[], batchSize: number = this.DEFAULT_BATCH_SIZE): Promise<BatchInsertResult> {
    const startTime = Date.now();
    
    if (entries.length === 0) {
      return { 
        insertedCount: 0, 
        failedCount: 0, 
        errors: [], 
        batchSize: 0,
        processingTimeMs: Date.now() - startTime
      };
    }

    let insertedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Process entries in chunks to avoid memory issues and improve performance
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const result = await this.insertBatch(batch);
      
      insertedCount += result.insertedCount;
      failedCount += result.failedCount;
      errors.push(...result.errors);
    }

    return { 
      insertedCount, 
      failedCount, 
      errors, 
      batchSize,
      processingTimeMs: Date.now() - startTime
    };
  }

  /**
   * Internal method to insert a single batch with optimized SQL
   */
  private async insertBatch(entries: ParsedLogEntry[]): Promise<BatchInsertResult> {
    const connection = await this.connectionPool.acquire();
    let insertedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      await connection.beginTransaction();

      // Use bulk insert with VALUES for better performance
      const placeholders = entries.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      
      const insertSql = `
        INSERT INTO log_entries (
          timestamp, client_ip, target_ip, request_processing_time,
          target_processing_time, response_processing_time, elb_status_code,
          target_status_code, received_bytes, sent_bytes, request_verb,
          request_url, request_protocol, user_agent, ssl_cipher,
          ssl_protocol, target_group_arn, trace_id, domain_name,
          chosen_cert_arn, matched_rule_priority, request_creation_time,
          actions_executed, redirect_url, error_reason, target_port_list,
          target_status_code_list, classification, classification_reason,
          connection_id
        ) VALUES ${placeholders}
      `;

      const params: any[] = [];
      for (const entry of entries) {
        params.push(
          entry.timestamp.toISOString(),
          entry.clientIp,
          entry.targetIp,
          entry.requestProcessingTime,
          entry.targetProcessingTime,
          entry.responseProcessingTime,
          entry.elbStatusCode,
          entry.targetStatusCode,
          entry.receivedBytes,
          entry.sentBytes,
          entry.requestVerb,
          entry.requestUrl,
          entry.requestProtocol,
          entry.userAgent,
          entry.sslCipher || null,
          entry.sslProtocol || null,
          entry.targetGroupArn,
          entry.traceId,
          entry.domainName,
          entry.chosenCertArn || null,
          entry.matchedRulePriority,
          entry.requestCreationTime.toISOString(),
          entry.actionsExecuted,
          entry.redirectUrl || null,
          entry.errorReason || null,
          entry.targetPortList,
          entry.targetStatusCodeList,
          entry.classification,
          entry.classificationReason,
          entry.connectionId || null
        );
      }

      await connection.execute(insertSql, params);
      insertedCount = entries.length;
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      failedCount = entries.length;
      errors.push(`Failed to insert batch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await this.connectionPool.release(connection);
    }

    return { insertedCount, failedCount, errors, batchSize: entries.length, processingTimeMs: 0 };
  }

  /**
   * Query log entries with optional filtering and performance optimizations
   */
  async query(filters?: FilterCriteria, options?: QueryOptions): Promise<ParsedLogEntry[]> {
    const connection = await this.connectionPool.acquire();
    const startTime = Date.now();
    const timeout = options?.timeoutMs || filters?.timeoutMs || this.DEFAULT_TIMEOUT_MS;

    try {
      // Apply safety limits
      const safeFilters = this.applySafetyLimits(filters);
      const { sql, params } = this.buildQuerySql(safeFilters, options);
      
      // Set query timeout if supported
      const result = await Promise.race([
        connection.query<any>(sql, params),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
        )
      ]);

      const processingTime = Date.now() - startTime;
      console.log(`Query completed in ${processingTime}ms, returned ${result.rows.length} rows`);

      return result.rows.map(row => this.mapRowToLogEntry(row));
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Query log entries with pagination for large datasets
   */
  async queryPaginated(
    filters?: FilterCriteria, 
    page: number = 1, 
    pageSize: number = this.DEFAULT_PAGE_SIZE,
    options?: QueryOptions
  ): Promise<PaginatedResult<ParsedLogEntry>> {
    const startTime = Date.now();
    const connection = await this.connectionPool.acquire();

    try {
      // Ensure page and pageSize are valid
      const validPage = Math.max(1, page);
      const validPageSize = Math.min(pageSize, 1000); // Cap at 1000 for safety
      const offset = (validPage - 1) * validPageSize;

      // Get total count first (use aggregation table if available)
      const totalCount = await this.count(filters);
      const totalPages = Math.ceil(totalCount / validPageSize);

      // Apply pagination to filters
      const paginatedFilters = {
        ...filters,
        limit: validPageSize,
        offset: offset
      };

      const data = await this.query(paginatedFilters, options);
      const hasMore = validPage < totalPages;
      const nextOffset = hasMore ? offset + validPageSize : undefined;

      return {
        data,
        totalCount,
        hasMore,
        nextOffset,
        currentPage: validPage,
        totalPages,
        processingTimeMs: Date.now() - startTime
      };
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Cursor-based pagination for very large datasets - more efficient than offset pagination
   * Uses timestamp + id as cursor for stable pagination
   */
  async queryCursorPaginated(
    filters?: FilterCriteria, 
    cursor?: string, 
    limit: number = 100,
    direction: 'forward' | 'backward' = 'forward'
  ): Promise<{ data: ParsedLogEntry[]; nextCursor?: string; prevCursor?: string; hasMore: boolean; processingTimeMs: number }> {
    const startTime = Date.now();
    const connection = await this.connectionPool.acquire();
    
    try {
      const safeLimit = Math.min(limit, 1000); // Cap at 1000 for safety
      let cursorTimestamp: string | null = null;
      let cursorId: number | null = null;
      
      // Parse cursor if provided
      if (cursor) {
        try {
          const [timestamp, id] = cursor.split('|');
          cursorTimestamp = timestamp;
          cursorId = parseInt(id, 10);
        } catch (error) {
          throw new Error('Invalid cursor format. Expected format: timestamp|id');
        }
      }
      
      // Build cursor-optimized query
      let sql = `
        SELECT 
          id, timestamp, client_ip, target_ip, request_processing_time,
          target_processing_time, response_processing_time, elb_status_code,
          target_status_code, received_bytes, sent_bytes, request_verb,
          request_url, request_protocol, user_agent, ssl_cipher,
          ssl_protocol, target_group_arn, trace_id, domain_name,
          chosen_cert_arn, matched_rule_priority, request_creation_time,
          actions_executed, redirect_url, error_reason, target_port_list,
          target_status_code_list, classification, classification_reason,
          created_at
        FROM log_entries
        INDEXED BY idx_log_entries_pagination_timestamp
      `;
      
      const conditions: string[] = [];
      const params: any[] = [];
      
      // Add cursor conditions
      if (cursorTimestamp && cursorId) {
        if (direction === 'forward') {
          conditions.push('(timestamp < ? OR (timestamp = ? AND id < ?))');
          params.push(cursorTimestamp, cursorTimestamp, cursorId);
        } else {
          conditions.push('(timestamp > ? OR (timestamp = ? AND id > ?))');
          params.push(cursorTimestamp, cursorTimestamp, cursorId);
        }
      }
      
      // Add filters
      if (filters) {
        if (filters.timeRange) {
          conditions.push('timestamp >= ? AND timestamp <= ?');
          params.push(filters.timeRange.start.toISOString(), filters.timeRange.end.toISOString());
        }
        
        if (filters.clientIps && filters.clientIps.length > 0) {
          const placeholders = filters.clientIps.map(() => '?').join(',');
          conditions.push(`client_ip IN (${placeholders})`);
          params.push(...filters.clientIps);
        }
        
        if (filters.statusCodes && filters.statusCodes.length > 0) {
          const placeholders = filters.statusCodes.map(() => '?').join(',');
          conditions.push(`elb_status_code IN (${placeholders})`);
          params.push(...filters.statusCodes);
        }
      }
      
      // Add WHERE clause
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Add ordering
      const orderDirection = direction === 'forward' ? 'DESC' : 'ASC';
      sql += ` ORDER BY timestamp ${orderDirection}, id ${orderDirection}`;
      
      // Add limit (fetch one extra to check for more data)
      sql += ' LIMIT ?';
      params.push(safeLimit + 1);
      
      const result = await connection.query<any>(sql, params);
      const rows = result.rows;
      
      // Check if there are more results
      const hasMore = rows.length > safeLimit;
      if (hasMore) {
        rows.pop(); // Remove the extra row
      }
      
      const data = rows.map(row => this.mapRowToLogEntry(row));
      
      // Generate cursors
      let nextCursor: string | undefined;
      let prevCursor: string | undefined;
      
      if (data.length > 0) {
        const lastItem = data[data.length - 1];
        const firstItem = data[0];
        
        if (direction === 'forward') {
          nextCursor = hasMore ? `${lastItem.timestamp.toISOString()}|${lastItem.id}` : undefined;
          prevCursor = cursor ? `${firstItem.timestamp.toISOString()}|${firstItem.id}` : undefined;
        } else {
          nextCursor = cursor ? `${lastItem.timestamp.toISOString()}|${lastItem.id}` : undefined;
          prevCursor = hasMore ? `${firstItem.timestamp.toISOString()}|${firstItem.id}` : undefined;
        }
      }
      
      return {
        data,
        nextCursor,
        prevCursor,
        hasMore,
        processingTimeMs: Date.now() - startTime
      };
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Stream query results in batches to avoid memory issues with large datasets
   */
  async queryStream(
    callback: (batch: ParsedLogEntry[]) => Promise<void>,
    filters?: FilterCriteria, 
    batchSize: number = 1000
  ): Promise<void> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batchFilters = {
        ...filters,
        limit: batchSize,
        offset: offset
      };

      const batch = await this.query(batchFilters);
      
      if (batch.length === 0) {
        hasMore = false;
      } else {
        await callback(batch);
        offset += batchSize;
        hasMore = batch.length === batchSize;
      }
    }
  }

  /**
   * Query aggregated data from summary tables for fast analytics
   */
  async queryAggregated(filters?: FilterCriteria): Promise<any> {
    const connection = await this.connectionPool.acquire();

    try {
      // Use hourly summary table for time-based aggregations
      let sql = `
        SELECT 
          hour_timestamp,
          domain_name,
          SUM(request_count) as total_requests,
          SUM(error_count) as total_errors,
          AVG(avg_request_time) as avg_request_time,
          SUM(total_bytes_received) as total_bytes_received,
          SUM(total_bytes_sent) as total_bytes_sent
        FROM log_entries_hourly_summary
      `;

      const conditions: string[] = [];
      const params: any[] = [];

      if (filters?.timeRange) {
        conditions.push('hour_timestamp >= ? AND hour_timestamp <= ?');
        params.push(
          filters.timeRange.start.toISOString(),
          filters.timeRange.end.toISOString()
        );
      }

      if (filters?.domainNames && filters.domainNames.length > 0) {
        const placeholders = filters.domainNames.map(() => '?').join(',');
        conditions.push(`domain_name IN (${placeholders})`);
        params.push(...filters.domainNames);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' GROUP BY hour_timestamp, domain_name ORDER BY hour_timestamp DESC';

      const result = await connection.query(sql, params);
      return result.rows;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Count log entries with optional filtering
   */
  async count(filters?: FilterCriteria): Promise<number> {
    const connection = await this.connectionPool.acquire();

    try {
      const { sql, params } = this.buildCountSql(filters);
      const result = await connection.query<{ count: number }>(sql, params);

      return result.rows[0]?.count || 0;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Create an index on a specific field
   */
  async createIndex(field: string): Promise<void> {
    const connection = await this.connectionPool.acquire();

    try {
      const indexName = `idx_log_entries_${field}`;
      const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON log_entries(${field})`;
      await connection.execute(sql);
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Drop an index
   */
  async dropIndex(indexName: string): Promise<void> {
    const connection = await this.connectionPool.acquire();

    try {
      const sql = `DROP INDEX IF EXISTS ${indexName}`;
      await connection.execute(sql);
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * List all indexes on the log_entries table
   */
  async listIndexes(): Promise<string[]> {
    const connection = await this.connectionPool.acquire();

    try {
      const sql = `
        SELECT name FROM sqlite_master 
        WHERE type='index' AND tbl_name='log_entries'
        AND name NOT LIKE 'sqlite_%'
      `;
      const result = await connection.query<{ name: string }>(sql);
      return result.rows.map(row => row.name);
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<StorageStats> {
    const connection = await this.connectionPool.acquire();

    try {
      // Get total entries count
      const countResult = await connection.query<{ count: number }>('SELECT COUNT(*) as count FROM log_entries');
      const totalEntries = countResult.rows[0]?.count || 0;

      // Get database size (SQLite specific)
      const pageCountResult = await connection.query<{ page_count: number }>('PRAGMA page_count');
      const pageSizeResult = await connection.query<{ page_size: number }>('PRAGMA page_size');
      const pageCount = pageCountResult.rows[0]?.page_count || 0;
      const pageSize = pageSizeResult.rows[0]?.page_size || 0;
      const databaseSize = pageCount * pageSize;

      // Get oldest and newest entries
      let oldestEntry: Date | null = null;
      let newestEntry: Date | null = null;

      if (totalEntries > 0) {
        const timeRangeResult = await connection.query<{ oldest: string; newest: string }>(`
          SELECT 
            MIN(timestamp) as oldest,
            MAX(timestamp) as newest
          FROM log_entries
        `);

        if (timeRangeResult.rows[0]) {
          oldestEntry = timeRangeResult.rows[0].oldest ? new Date(timeRangeResult.rows[0].oldest) : null;
          newestEntry = timeRangeResult.rows[0].newest ? new Date(timeRangeResult.rows[0].newest) : null;
        }
      }

      // Get index count
      const indexResult = await connection.query<{ count: number }>(`
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type='index' AND tbl_name='log_entries'
        AND name NOT LIKE 'sqlite_%'
      `);
      const indexCount = indexResult.rows[0]?.count || 0;

      return {
        totalEntries,
        databaseSize,
        oldestEntry,
        newestEntry,
        indexCount
      };
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Get database size in bytes
   */
  async getDatabaseSize(): Promise<number> {
    const connection = await this.connectionPool.acquire();

    try {
      const pageCountResult = await connection.query<{ page_count: number }>('PRAGMA page_count');
      const pageSizeResult = await connection.query<{ page_size: number }>('PRAGMA page_size');
      const pageCount = pageCountResult.rows[0]?.page_count || 0;
      const pageSize = pageSizeResult.rows[0]?.page_size || 0;
      return pageCount * pageSize;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Get query performance statistics
   */
  async getQueryPerformanceStats(): Promise<any> {
    const connection = await this.connectionPool.acquire();

    try {
      // Get query performance metrics
      const stats = await connection.query(`
        SELECT 
          name as index_name,
          sql as index_sql
        FROM sqlite_master 
        WHERE type='index' AND tbl_name='log_entries'
        AND name NOT LIKE 'sqlite_%'
      `);

      // Get table statistics
      const tableStats = await connection.query('PRAGMA table_info(log_entries)');
      
      return {
        indexes: stats.rows,
        tableInfo: tableStats.rows,
        recommendations: this.getPerformanceRecommendations(stats.rows)
      };
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Optimize database indexes and performance
   */
  async optimizeIndexes(): Promise<void> {
    const connection = await this.connectionPool.acquire();

    try {
      // Analyze table to update query planner statistics
      await connection.execute('ANALYZE log_entries');
      
      // Update index statistics
      const indexes = await this.listIndexes();
      for (const index of indexes) {
        await connection.execute(`ANALYZE ${index}`);
      }
      
      console.log('Database optimization completed');
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Vacuum database to reclaim space and improve performance
   */
  async vacuum(): Promise<void> {
    const connection = await this.connectionPool.acquire();

    try {
      await connection.execute('VACUUM');
      console.log('Database vacuum completed');
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Clear all data from the log_entries table
   */
  async clearData(): Promise<void> {
    const connection = await this.connectionPool.acquire();

    try {
      await connection.execute('DELETE FROM log_entries');
      // Reset auto-increment counter
      await connection.execute('DELETE FROM sqlite_sequence WHERE name="log_entries"');
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Delete entries older than specified date
   */
  async deleteOldEntries(olderThan: Date): Promise<number> {
    const connection = await this.connectionPool.acquire();

    try {
      const result = await connection.execute(
        'DELETE FROM log_entries WHERE timestamp < ?',
        [olderThan.toISOString()]
      );
      return result.affectedRows;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Get count of files downloaded from a specific S3 prefix
   */
  async getFileCountByPrefix(s3KeyPrefix: string): Promise<number> {
    const connection = await this.connectionPool.acquire();

    try {
      // Query the download_batches table for S3 files matching the prefix
      // The s3_file_paths column contains a JSON array of S3 paths
      const sql = `
        SELECT s3_file_paths, file_count 
        FROM download_batches 
        WHERE status IN ('completed', 'processed')
      `;
      console.log(`[DataStore] Checking downloads for prefix: ${s3KeyPrefix}`);
      const result = await connection.query<{ s3_file_paths: string; file_count: number }>(sql);
      console.log(`[DataStore] Found ${result.rows.length} download batches`);
      
      let totalCount = 0;
      for (const row of result.rows) {
        try {
          const s3Paths: string[] = JSON.parse(row.s3_file_paths);
          // Count files that match the prefix
          const matchingFiles = s3Paths.filter(path => {
            // Remove s3:// prefix if present
            const cleanPath = path.startsWith('s3://') ? path.substring(5) : path;
            // Remove bucket name to get just the key
            const keyPart = cleanPath.includes('/') ? cleanPath.substring(cleanPath.indexOf('/') + 1) : cleanPath;
            const matches = keyPart.startsWith(s3KeyPrefix);
            if (matches && totalCount === 0) {
              console.log(`[DataStore] Found match! Path: ${keyPart.substring(0, 100)}...`);
            }
            return matches;
          });
          if (matchingFiles.length > 0) {
            console.log(`[DataStore] Batch has ${matchingFiles.length} matching files for prefix ${s3KeyPrefix}`);
          }
          totalCount += matchingFiles.length;
        } catch (e) {
          console.error('Error parsing s3_file_paths:', e);
        }
      }
      
      return totalCount;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Get the most recent download time for files from a specific S3 prefix
   */
  async getLastDownloadTime(s3KeyPrefix: string): Promise<Date | null> {
    const connection = await this.connectionPool.acquire();

    try {
      // Query the download_batches table for the most recent download matching the prefix
      const sql = `
        SELECT s3_file_paths, download_completed_at 
        FROM download_batches 
        WHERE status = 'completed'
        ORDER BY download_completed_at DESC
      `;
      const result = await connection.query<{ s3_file_paths: string; download_completed_at: string | null }>(sql);
      
      for (const row of result.rows) {
        try {
          const s3Paths: string[] = JSON.parse(row.s3_file_paths);
          // Check if any files match the prefix
          const hasMatchingFiles = s3Paths.some(path => {
            // Remove s3:// prefix if present
            const cleanPath = path.startsWith('s3://') ? path.substring(5) : path;
            // Remove bucket name to get just the key
            const keyPart = cleanPath.includes('/') ? cleanPath.substring(cleanPath.indexOf('/') + 1) : cleanPath;
            return keyPart.startsWith(s3KeyPrefix);
          });
          
          if (hasMatchingFiles && row.download_completed_at) {
            return new Date(row.download_completed_at);
          }
        } catch (e) {
          console.error('Error parsing s3_file_paths:', e);
        }
      }
      
      return null;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Close the data store and release resources
   */
  async close(): Promise<void> {
    await this.connectionPool.destroy();
  }

  /**
   * Apply safety limits to prevent memory issues
   */
  private applySafetyLimits(filters?: FilterCriteria): FilterCriteria {
    const safeFilters = { ...filters };
    
    // Apply maximum row limit if not already set
    if (!safeFilters.maxRows) {
      safeFilters.maxRows = this.MAX_QUERY_ROWS;
    }
    
    // Apply default limit if not set and no custom limit
    if (!safeFilters.limit && !safeFilters.maxRows) {
      safeFilters.limit = Math.min(1000, this.MAX_QUERY_ROWS);
    }
    
    // Ensure limit doesn't exceed max rows
    if (safeFilters.limit && safeFilters.limit > this.MAX_QUERY_ROWS) {
      safeFilters.limit = this.MAX_QUERY_ROWS;
    }
    
    return safeFilters;
  }

  /**
   * Build SQL query with filters and performance optimizations
   * Uses optimized pagination indexes for better performance with large datasets
   */
  private buildQuerySql(filters?: FilterCriteria, options?: QueryOptions): { sql: string; params: any[] } {
    // Use covering index hint for pagination queries when appropriate
    const useOptimizedPagination = (filters?.limit || 0) > 100 || (filters?.offset || 0) > 10000;
    
    let sql = `
      SELECT 
        id, timestamp, client_ip, target_ip, request_processing_time,
        target_processing_time, response_processing_time, elb_status_code,
        target_status_code, received_bytes, sent_bytes, request_verb,
        request_url, request_protocol, user_agent, ssl_cipher,
        ssl_protocol, target_group_arn, trace_id, domain_name,
        chosen_cert_arn, matched_rule_priority, request_creation_time,
        actions_executed, redirect_url, error_reason, target_port_list,
        target_status_code_list, classification, classification_reason,
        created_at
      FROM log_entries
    `;
    
    // Add index hint for large pagination queries
    if (useOptimizedPagination && !options?.forceIndex) {
      sql = sql.replace('FROM log_entries', 'FROM log_entries INDEXED BY idx_log_entries_pagination_timestamp');
    }

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters) {
      if (filters.timeRange) {
        conditions.push('timestamp >= ? AND timestamp <= ?');
        params.push(filters.timeRange.start.toISOString(), filters.timeRange.end.toISOString());
      }

      if (filters.endpoints && filters.endpoints.length > 0) {
        const placeholders = filters.endpoints.map(() => '?').join(',');
        conditions.push(`request_url IN (${placeholders})`);
        params.push(...filters.endpoints);
      }

      if (filters.statusCodes && filters.statusCodes.length > 0) {
        const placeholders = filters.statusCodes.map(() => '?').join(',');
        conditions.push(`elb_status_code IN (${placeholders})`);
        params.push(...filters.statusCodes);
      }

      if (filters.clientIps && filters.clientIps.length > 0) {
        const placeholders = filters.clientIps.map(() => '?').join(',');
        conditions.push(`client_ip IN (${placeholders})`);
        params.push(...filters.clientIps);
      }

      if (filters.userAgentPatterns && filters.userAgentPatterns.length > 0) {
        const userAgentConditions = filters.userAgentPatterns.map(() => 'user_agent LIKE ?');
        conditions.push(`(${userAgentConditions.join(' OR ')})`);
        params.push(...filters.userAgentPatterns.map(pattern => `%${pattern}%`));
      }

      if (filters.domainNames && filters.domainNames.length > 0) {
        const placeholders = filters.domainNames.map(() => '?').join(',');
        conditions.push(`domain_name IN (${placeholders})`);
        params.push(...filters.domainNames);
      }
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Add sorting
    const sortBy = filters?.sortBy || 'timestamp';
    const sortOrder = filters?.sortOrder || 'DESC';
    sql += ` ORDER BY ${sortBy} ${sortOrder}`;

    // Force index hint for performance if specified
    if (options?.forceIndex) {
      sql = sql.replace('FROM log_entries', `FROM log_entries USE INDEX (${options.forceIndex})`);
    }

    // Apply limit with safety check
    const limit = Math.min(filters?.limit || 1000, this.MAX_QUERY_ROWS);
    sql += ' LIMIT ?';
    params.push(limit);

    if (filters?.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    return { sql, params };
  }

  /**
   * Build count SQL query with filters
   */
  private buildCountSql(filters?: FilterCriteria): { sql: string; params: any[] } {
    let sql = 'SELECT COUNT(*) as count FROM log_entries';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters) {
      if (filters.timeRange) {
        conditions.push('timestamp >= ? AND timestamp <= ?');
        params.push(filters.timeRange.start.toISOString(), filters.timeRange.end.toISOString());
      }

      if (filters.endpoints && filters.endpoints.length > 0) {
        const placeholders = filters.endpoints.map(() => '?').join(',');
        conditions.push(`request_url IN (${placeholders})`);
        params.push(...filters.endpoints);
      }

      if (filters.statusCodes && filters.statusCodes.length > 0) {
        const placeholders = filters.statusCodes.map(() => '?').join(',');
        conditions.push(`elb_status_code IN (${placeholders})`);
        params.push(...filters.statusCodes);
      }

      if (filters.clientIps && filters.clientIps.length > 0) {
        const placeholders = filters.clientIps.map(() => '?').join(',');
        conditions.push(`client_ip IN (${placeholders})`);
        params.push(...filters.clientIps);
      }

      if (filters.userAgentPatterns && filters.userAgentPatterns.length > 0) {
        const userAgentConditions = filters.userAgentPatterns.map(() => 'user_agent LIKE ?');
        conditions.push(`(${userAgentConditions.join(' OR ')})`);
        params.push(...filters.userAgentPatterns.map(pattern => `%${pattern}%`));
      }

      if (filters.domainNames && filters.domainNames.length > 0) {
        const placeholders = filters.domainNames.map(() => '?').join(',');
        conditions.push(`domain_name IN (${placeholders})`);
        params.push(...filters.domainNames);
      }
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    return { sql, params };
  }

  /**
   * Get performance recommendations based on current indexes
   */
  private getPerformanceRecommendations(indexes: any[]): string[] {
    const recommendations: string[] = [];
    const indexNames = indexes.map(idx => idx.index_name.toLowerCase());

    // Check for essential indexes
    const essentialIndexes = [
      'idx_log_entries_client_timestamp',
      'idx_log_entries_session_workflow',
      'idx_log_entries_timestamp_status'
    ];

    for (const essential of essentialIndexes) {
      if (!indexNames.includes(essential.toLowerCase())) {
        recommendations.push(`Consider creating index: ${essential}`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Database indexes are optimally configured');
    }

    return recommendations;
  }

  /**
   * Map database row to ParsedLogEntry
   */
  private mapRowToLogEntry(row: any): ParsedLogEntry {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      clientIp: row.client_ip,
      targetIp: row.target_ip,
      requestProcessingTime: row.request_processing_time,
      targetProcessingTime: row.target_processing_time,
      responseProcessingTime: row.response_processing_time,
      elbStatusCode: row.elb_status_code,
      targetStatusCode: row.target_status_code,
      receivedBytes: row.received_bytes,
      sentBytes: row.sent_bytes,
      requestVerb: row.request_verb,
      requestUrl: row.request_url,
      requestProtocol: row.request_protocol,
      userAgent: row.user_agent,
      sslCipher: row.ssl_cipher,
      sslProtocol: row.ssl_protocol,
      targetGroupArn: row.target_group_arn,
      traceId: row.trace_id,
      domainName: row.domain_name,
      chosenCertArn: row.chosen_cert_arn,
      matchedRulePriority: row.matched_rule_priority,
      requestCreationTime: new Date(row.request_creation_time),
      actionsExecuted: row.actions_executed,
      redirectUrl: row.redirect_url,
      errorReason: row.error_reason,
      targetPortList: row.target_port_list,
      targetStatusCodeList: row.target_status_code_list,
      classification: row.classification,
      classificationReason: row.classification_reason,
      connectionId: row.connection_id,
      createdAt: row.created_at ? new Date(row.created_at) : undefined
    };
  }
}/**

 * Factory function to create DataStore instances
 */
export async function createDataStore(connectionPool: ConnectionPool): Promise<DataStore> {
  return new SqliteDataStore(connectionPool);
}

export default DataStore;