/**
 * Aggregation Service for maintaining summary tables
 * Processes raw log entries into optimized summary tables for fast analytics
 */

import { DataStore, FilterCriteria } from './DataStore';
import { DatabaseConnection, ConnectionPool } from './types';

export interface AggregationResult {
  processed: number;
  updated: number;
  errors: number;
  processingTimeMs: number;
}

export interface AggregationSchedule {
  hourly: boolean;
  daily: boolean;
  realtime: boolean;
}

export class AggregationService {
  private connectionPool: ConnectionPool;
  private dataStore: DataStore;

  constructor(connectionPool: ConnectionPool, dataStore: DataStore) {
    this.connectionPool = connectionPool;
    this.dataStore = dataStore;
  }

  /**
   * Run all aggregation tasks
   */
  async runAggregation(
    since?: Date,
    schedule: AggregationSchedule = { hourly: true, daily: false, realtime: false }
  ): Promise<AggregationResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    console.log('Starting aggregation process...');

    try {
      if (schedule.hourly) {
        const hourlyResult = await this.updateHourlySummary(since);
        totalProcessed += hourlyResult.processed;
        totalUpdated += hourlyResult.updated;
        totalErrors += hourlyResult.errors;
      }

      if (schedule.daily) {
        const dailyResult = await this.updateDailySummary(since);
        totalProcessed += dailyResult.processed;
        totalUpdated += dailyResult.updated;
        totalErrors += dailyResult.errors;
      }

      const urlResult = await this.updateUrlPatternSummary(since);
      totalProcessed += urlResult.processed;
      totalUpdated += urlResult.updated;
      totalErrors += urlResult.errors;

      const sessionResult = await this.updateSessionSummary(since);
      totalProcessed += sessionResult.processed;
      totalUpdated += sessionResult.updated;
      totalErrors += sessionResult.errors;

      const errorResult = await this.updateErrorPatternSummary(since);
      totalProcessed += errorResult.processed;
      totalUpdated += errorResult.updated;
      totalErrors += errorResult.errors;

      console.log(`Aggregation completed: ${totalUpdated} records updated from ${totalProcessed} processed in ${Date.now() - startTime}ms`);

      return {
        processed: totalProcessed,
        updated: totalUpdated,
        errors: totalErrors,
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.error('Aggregation failed:', error);
      throw error;
    }
  }

  /**
   * Update hourly summary table
   */
  async updateHourlySummary(since?: Date): Promise<AggregationResult> {
    const connection = await this.connectionPool.acquire();
    let processed = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log('Updating hourly summary...');

      // Get the latest aggregated hour to avoid reprocessing
      let lastAggregatedHour = since;
      if (!lastAggregatedHour) {
        const lastResult = await connection.query(`
          SELECT MAX(hour_timestamp) as last_hour 
          FROM log_entries_hourly_summary
        `);
        if (lastResult.rows[0]?.last_hour) {
          lastAggregatedHour = new Date(lastResult.rows[0].last_hour);
        }
      }

      // Aggregate by hour and domain
      const aggregationSql = `
        SELECT 
          datetime(timestamp, 'start of hour') as hour_timestamp,
          domain_name,
          COUNT(*) as request_count,
          SUM(CASE WHEN elb_status_code >= 400 THEN 1 ELSE 0 END) as error_count,
          AVG(request_processing_time) as avg_request_time,
          AVG(target_processing_time) as avg_target_time,
          AVG(response_processing_time) as avg_response_time,
          SUM(received_bytes) as total_bytes_received,
          SUM(sent_bytes) as total_bytes_sent,
          COUNT(DISTINCT client_ip) as unique_clients,
          SUM(CASE WHEN elb_status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) as status_code_2xx,
          SUM(CASE WHEN elb_status_code BETWEEN 300 AND 399 THEN 1 ELSE 0 END) as status_code_3xx,
          SUM(CASE WHEN elb_status_code BETWEEN 400 AND 499 THEN 1 ELSE 0 END) as status_code_4xx,
          SUM(CASE WHEN elb_status_code >= 500 THEN 1 ELSE 0 END) as status_code_5xx
        FROM log_entries
        WHERE timestamp >= ?
        GROUP BY datetime(timestamp, 'start of hour'), domain_name
        ORDER BY hour_timestamp DESC
      `;

      const params = [lastAggregatedHour ? lastAggregatedHour.toISOString() : '1970-01-01'];
      const aggregatedData = await connection.query(aggregationSql, params);
      processed = aggregatedData.rows.length;

      // Upsert aggregated data
      for (const row of aggregatedData.rows) {
        try {
          await connection.execute(`
            INSERT OR REPLACE INTO log_entries_hourly_summary (
              hour_timestamp, domain_name, request_count, error_count,
              avg_request_time, avg_target_time, avg_response_time,
              total_bytes_received, total_bytes_sent, unique_clients,
              status_code_2xx, status_code_3xx, status_code_4xx, status_code_5xx,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            row.hour_timestamp,
            row.domain_name,
            row.request_count,
            row.error_count,
            row.avg_request_time || 0,
            row.avg_target_time || 0,
            row.avg_response_time || 0,
            row.total_bytes_received || 0,
            row.total_bytes_sent || 0,
            row.unique_clients,
            row.status_code_2xx || 0,
            row.status_code_3xx || 0,
            row.status_code_4xx || 0,
            row.status_code_5xx || 0
          ]);
          updated++;
        } catch (error) {
          console.error('Error updating hourly summary row:', error);
          errors++;
        }
      }

    } finally {
      await this.connectionPool.release(connection);
    }

    return { processed, updated, errors, processingTimeMs: 0 };
  }

  /**
   * Update URL pattern summary
   */
  async updateUrlPatternSummary(since?: Date): Promise<AggregationResult> {
    const connection = await this.connectionPool.acquire();
    let processed = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log('Updating URL pattern summary...');

      // Aggregate URL patterns
      const aggregationSql = `
        SELECT 
          ${this.getNormalizedUrlExpression()} as url_pattern,
          domain_name,
          request_verb,
          COUNT(*) as request_count,
          SUM(CASE WHEN elb_status_code >= 400 THEN 1 ELSE 0 END) as error_count,
          AVG(request_processing_time) as avg_request_time,
          AVG(target_processing_time) as avg_target_time,
          MIN(request_processing_time) as min_request_time,
          MAX(request_processing_time) as max_request_time,
          SUM(received_bytes) as total_bytes_received,
          SUM(sent_bytes) as total_bytes_sent,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_seen
        FROM log_entries
        WHERE timestamp >= ?
        GROUP BY ${this.getNormalizedUrlExpression()}, domain_name, request_verb
        HAVING request_count >= 10  -- Only include patterns with significant traffic
        ORDER BY request_count DESC
      `;

      const params = [since ? since.toISOString() : '1970-01-01'];
      const aggregatedData = await connection.query(aggregationSql, params);
      processed = aggregatedData.rows.length;

      // Upsert URL pattern data
      for (const row of aggregatedData.rows) {
        try {
          await connection.execute(`
            INSERT OR REPLACE INTO log_entries_url_summary (
              url_pattern, domain_name, request_verb, request_count, error_count,
              avg_request_time, avg_target_time, min_request_time, max_request_time,
              total_bytes_received, total_bytes_sent, first_seen, last_seen, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            row.url_pattern,
            row.domain_name,
            row.request_verb,
            row.request_count,
            row.error_count,
            row.avg_request_time || 0,
            row.avg_target_time || 0,
            row.min_request_time || 0,
            row.max_request_time || 0,
            row.total_bytes_received || 0,
            row.total_bytes_sent || 0,
            row.first_seen,
            row.last_seen
          ]);
          updated++;
        } catch (error) {
          console.error('Error updating URL pattern summary:', error);
          errors++;
        }
      }

    } finally {
      await this.connectionPool.release(connection);
    }

    return { processed, updated, errors, processingTimeMs: 0 };
  }

  /**
   * Update client session summary
   */
  async updateSessionSummary(since?: Date): Promise<AggregationResult> {
    const connection = await this.connectionPool.acquire();
    let processed = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log('Updating session summary...');

      // Aggregate session data by client and date
      const aggregationSql = `
        SELECT 
          client_ip,
          substr(user_agent, 1, 32) as user_agent_hash,  -- Simple hash approximation
          date(timestamp) as session_date,
          COUNT(*) as total_requests,
          COUNT(DISTINCT ${this.getNormalizedUrlExpression()}) as unique_urls,
          COUNT(DISTINCT datetime(timestamp, 'start of hour')) as session_count,
          AVG(julianday(max_timestamp) - julianday(min_timestamp)) * 86400000 as session_duration_avg,
          MAX(julianday(max_timestamp) - julianday(min_timestamp)) * 86400000 as session_duration_max,
          CAST(SUM(CASE WHEN elb_status_code >= 400 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as error_rate
        FROM (
          SELECT 
            client_ip, user_agent, timestamp, elb_status_code, request_url,
            ${this.getNormalizedUrlExpression()},
            MIN(timestamp) OVER (PARTITION BY client_ip, date(timestamp)) as min_timestamp,
            MAX(timestamp) OVER (PARTITION BY client_ip, date(timestamp)) as max_timestamp
          FROM log_entries
          WHERE timestamp >= ?
        ) grouped
        GROUP BY client_ip, substr(user_agent, 1, 32), date(timestamp)
        HAVING total_requests >= 5  -- Only include active sessions
      `;

      const params = [since ? since.toISOString() : '1970-01-01'];
      const aggregatedData = await connection.query(aggregationSql, params);
      processed = aggregatedData.rows.length;

      // Upsert session data
      for (const row of aggregatedData.rows) {
        try {
          await connection.execute(`
            INSERT OR REPLACE INTO client_session_summary (
              client_ip, user_agent_hash, session_date, session_count, total_requests,
              unique_urls, session_duration_avg, session_duration_max, error_rate, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            row.client_ip,
            row.user_agent_hash,
            row.session_date,
            row.session_count || 1,
            row.total_requests,
            row.unique_urls,
            row.session_duration_avg || 0,
            row.session_duration_max || 0,
            row.error_rate || 0
          ]);
          updated++;
        } catch (error) {
          console.error('Error updating session summary:', error);
          errors++;
        }
      }

    } finally {
      await this.connectionPool.release(connection);
    }

    return { processed, updated, errors, processingTimeMs: 0 };
  }

  /**
   * Update error pattern summary
   */
  async updateErrorPatternSummary(since?: Date): Promise<AggregationResult> {
    const connection = await this.connectionPool.acquire();
    let processed = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log('Updating error pattern summary...');

      // Aggregate error patterns
      const aggregationSql = `
        SELECT 
          CASE 
            WHEN error_reason IS NOT NULL THEN error_reason
            ELSE 'HTTP_' || elb_status_code
          END as error_pattern,
          elb_status_code,
          target_status_code,
          error_reason,
          ${this.getNormalizedUrlExpression()} as url_pattern,
          COUNT(*) as occurrence_count,
          MIN(timestamp) as first_occurrence,
          MAX(timestamp) as last_occurrence
        FROM log_entries
        WHERE elb_status_code >= 400 
          AND timestamp >= ?
        GROUP BY 
          CASE 
            WHEN error_reason IS NOT NULL THEN error_reason
            ELSE 'HTTP_' || elb_status_code
          END,
          elb_status_code, target_status_code, error_reason, ${this.getNormalizedUrlExpression()}
        HAVING occurrence_count >= 5  -- Only track significant error patterns
        ORDER BY occurrence_count DESC
      `;

      const params = [since ? since.toISOString() : '1970-01-01'];
      const aggregatedData = await connection.query(aggregationSql, params);
      processed = aggregatedData.rows.length;

      // Upsert error pattern data
      for (const row of aggregatedData.rows) {
        try {
          await connection.execute(`
            INSERT OR REPLACE INTO error_pattern_summary (
              error_pattern, elb_status_code, target_status_code, error_reason,
              url_pattern, occurrence_count, first_occurrence, last_occurrence, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            row.error_pattern,
            row.elb_status_code,
            row.target_status_code,
            row.error_reason,
            row.url_pattern,
            row.occurrence_count,
            row.first_occurrence,
            row.last_occurrence
          ]);
          updated++;
        } catch (error) {
          console.error('Error updating error pattern summary:', error);
          errors++;
        }
      }

    } finally {
      await this.connectionPool.release(connection);
    }

    return { processed, updated, errors, processingTimeMs: 0 };
  }

  /**
   * Update daily summary (placeholder for future implementation)
   */
  private async updateDailySummary(since?: Date): Promise<AggregationResult> {
    // Implementation similar to hourly but grouped by day
    return { processed: 0, updated: 0, errors: 0, processingTimeMs: 0 };
  }

  /**
   * Get normalized URL expression for SQLite
   */
  private getNormalizedUrlExpression(): string {
    // SQLite doesn't have full regex support, so we use simpler pattern matching
    return `
      CASE
        WHEN request_url LIKE '%/%/%' THEN
          replace(
            replace(
              replace(request_url, rtrim(request_url, replace(request_url, '/', '')), ''),
              '0', '{id}'),
            '1', '{id}')
        ELSE request_url
      END
    `;
  }

  /**
   * Get aggregation statistics
   */
  async getAggregationStats(): Promise<any> {
    const connection = await this.connectionPool.acquire();

    try {
      const stats = await connection.query(`
        SELECT 
          'hourly_summary' as table_name,
          COUNT(*) as record_count,
          MIN(hour_timestamp) as earliest_data,
          MAX(hour_timestamp) as latest_data,
          MAX(updated_at) as last_updated
        FROM log_entries_hourly_summary
        UNION ALL
        SELECT 
          'url_summary' as table_name,
          COUNT(*) as record_count,
          MIN(first_seen) as earliest_data,
          MAX(last_seen) as latest_data,
          MAX(updated_at) as last_updated
        FROM log_entries_url_summary
        UNION ALL
        SELECT 
          'session_summary' as table_name,
          COUNT(*) as record_count,
          MIN(session_date) as earliest_data,
          MAX(session_date) as latest_data,
          MAX(updated_at) as last_updated
        FROM client_session_summary
        UNION ALL
        SELECT 
          'error_summary' as table_name,
          COUNT(*) as record_count,
          MIN(first_occurrence) as earliest_data,
          MAX(last_occurrence) as latest_data,
          MAX(updated_at) as last_updated
        FROM error_pattern_summary
      `);

      return stats.rows;
    } finally {
      await this.connectionPool.release(connection);
    }
  }

  /**
   * Clean up old aggregation data
   */
  async cleanupOldAggregations(olderThan: Date): Promise<number> {
    const connection = await this.connectionPool.acquire();
    let totalDeleted = 0;

    try {
      // Clean hourly summaries
      const hourlyResult = await connection.execute(
        'DELETE FROM log_entries_hourly_summary WHERE hour_timestamp < ?',
        [olderThan.toISOString()]
      );
      totalDeleted += hourlyResult.affectedRows;

      // Clean session summaries  
      const sessionResult = await connection.execute(
        'DELETE FROM client_session_summary WHERE session_date < ?',
        [olderThan.toISOString()]
      );
      totalDeleted += sessionResult.affectedRows;

      console.log(`Cleaned up ${totalDeleted} old aggregation records`);
      return totalDeleted;
    } finally {
      await this.connectionPool.release(connection);
    }
  }
}