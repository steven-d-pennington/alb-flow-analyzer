/**
 * Performance optimization migration: Add critical indexes for large dataset handling
 */

import { Migration } from './types';
import { DatabaseConnection } from '../types';

export const addPerformanceIndexesMigration: Migration = {
  id: '002',
  name: 'add_performance_indexes',
  
  async up(connection: DatabaseConnection): Promise<void> {
    const indexes = [
      // Critical composite indexes for workflow analysis
      'CREATE INDEX IF NOT EXISTS idx_log_entries_client_timestamp ON log_entries(client_ip, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_log_entries_session_workflow ON log_entries(client_ip, timestamp, request_url)',
      
      // Performance indexes for session reconstruction
      'CREATE INDEX IF NOT EXISTS idx_log_entries_session_key ON log_entries(client_ip, user_agent, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_log_entries_trace_id ON log_entries(trace_id)',
      
      // Indexes for aggregation queries
      'CREATE INDEX IF NOT EXISTS idx_log_entries_status_timestamp ON log_entries(elb_status_code, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_log_entries_domain_timestamp ON log_entries(domain_name, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_log_entries_verb_url ON log_entries(request_verb, request_url)',
      
      // Index for time-based partitioning queries
      'CREATE INDEX IF NOT EXISTS idx_log_entries_created_at ON log_entries(created_at)',
      
      // Covering indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_log_entries_summary_stats ON log_entries(timestamp, elb_status_code, request_processing_time, target_processing_time)',
      
      // Index for error analysis
      'CREATE INDEX IF NOT EXISTS idx_log_entries_error_analysis ON log_entries(elb_status_code, target_status_code, error_reason)',
      
      // Performance monitoring index
      'CREATE INDEX IF NOT EXISTS idx_log_entries_performance ON log_entries(request_processing_time, target_processing_time, response_processing_time)',
      
      // Index for bandwidth analysis
      'CREATE INDEX IF NOT EXISTS idx_log_entries_bytes ON log_entries(received_bytes, sent_bytes, timestamp)'
    ];
    
    console.log('Creating performance optimization indexes...');
    for (let i = 0; i < indexes.length; i++) {
      const indexSql = indexes[i];
      console.log(`Creating index ${i + 1}/${indexes.length}...`);
      await connection.execute(indexSql);
    }
    console.log('Performance indexes created successfully');
  },
  
  async down(connection: DatabaseConnection): Promise<void> {
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_log_entries_client_timestamp',
      'DROP INDEX IF EXISTS idx_log_entries_session_workflow',
      'DROP INDEX IF EXISTS idx_log_entries_session_key',
      'DROP INDEX IF EXISTS idx_log_entries_trace_id',
      'DROP INDEX IF EXISTS idx_log_entries_status_timestamp',
      'DROP INDEX IF EXISTS idx_log_entries_domain_timestamp',
      'DROP INDEX IF EXISTS idx_log_entries_verb_url',
      'DROP INDEX IF EXISTS idx_log_entries_created_at',
      'DROP INDEX IF EXISTS idx_log_entries_summary_stats',
      'DROP INDEX IF EXISTS idx_log_entries_error_analysis',
      'DROP INDEX IF EXISTS idx_log_entries_performance',
      'DROP INDEX IF EXISTS idx_log_entries_bytes'
    ];
    
    console.log('Dropping performance indexes...');
    for (const dropIndexSql of dropIndexes) {
      await connection.execute(dropIndexSql);
    }
    console.log('Performance indexes dropped successfully');
  }
};