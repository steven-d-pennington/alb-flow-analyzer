/**
 * Pagination optimization migration: Add indexes optimized for limit/offset queries
 */

import { Migration } from './types';
import { DatabaseConnection } from '../types';

export const optimizePaginationMigration: Migration = {
  id: '004',
  name: 'optimize_pagination',
  
  async up(connection: DatabaseConnection): Promise<void> {
    const paginationIndexes = [
      // Optimized index for pagination with timestamp ordering (most common case)
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_timestamp ON log_entries(timestamp DESC, id)',
      
      // Optimized index for pagination with id ordering (fast fallback)
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_id ON log_entries(id)',
      
      // Composite index for filtered pagination with status codes
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_status ON log_entries(elb_status_code, timestamp DESC, id)',
      
      // Composite index for filtered pagination with client IPs
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_client ON log_entries(client_ip, timestamp DESC, id)',
      
      // Composite index for filtered pagination with URLs/endpoints
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_url ON log_entries(request_url, timestamp DESC, id)',
      
      // Composite index for time-range filtered pagination
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_timerange ON log_entries(timestamp, id)',
      
      // Covering index for common pagination queries with essential fields
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_covering ON log_entries(timestamp DESC, client_ip, request_url, elb_status_code, id)',
      
      // Index for domain-based pagination (multi-tenant scenarios)
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_domain ON log_entries(domain_name, timestamp DESC, id)',
      
      // Index for user agent filtered pagination
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_useragent ON log_entries(user_agent, timestamp DESC, id) WHERE user_agent IS NOT NULL',
      
      // Partial index for error pagination (only non-200 status codes)
      'CREATE INDEX IF NOT EXISTS idx_log_entries_pagination_errors ON log_entries(timestamp DESC, id) WHERE elb_status_code >= 400'
    ];
    
    console.log('Creating pagination optimization indexes...');
    console.log('⚠️  This may take several minutes for large datasets...');
    
    for (let i = 0; i < paginationIndexes.length; i++) {
      const indexSql = paginationIndexes[i];
      const indexName = indexSql.match(/idx_log_entries_pagination_\w+/)?.[0] || `index_${i + 1}`;
      console.log(`Creating pagination index ${i + 1}/${paginationIndexes.length}: ${indexName}...`);
      
      const startTime = Date.now();
      await connection.execute(indexSql);
      const endTime = Date.now();
      
      console.log(`✅ ${indexName} created in ${endTime - startTime}ms`);
    }
    
    // Analyze tables to update query planner statistics
    console.log('Updating query planner statistics...');
    await connection.execute('ANALYZE log_entries');
    
    console.log('🚀 Pagination optimization completed successfully');
  },
  
  async down(connection: DatabaseConnection): Promise<void> {
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_log_entries_pagination_timestamp',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_id',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_status',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_client',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_url',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_timerange',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_covering',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_domain',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_useragent',
      'DROP INDEX IF EXISTS idx_log_entries_pagination_errors'
    ];
    
    console.log('Dropping pagination optimization indexes...');
    for (const dropIndexSql of dropIndexes) {
      await connection.execute(dropIndexSql);
    }
    console.log('Pagination optimization indexes dropped successfully');
  }
};