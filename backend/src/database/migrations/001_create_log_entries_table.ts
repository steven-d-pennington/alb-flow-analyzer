/**
 * Initial migration: Create log_entries table with ALB flow log fields
 */

import { Migration } from './types';
import { DatabaseConnection } from '../types';

export const createLogEntriesTableMigration: Migration = {
  id: '001',
  name: 'create_log_entries_table',
  
  async up(connection: DatabaseConnection): Promise<void> {
    // Create the main log entries table with all ALB flow log fields
    const createTableSql = `
      CREATE TABLE log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        client_ip TEXT,
        target_ip TEXT,
        request_processing_time REAL,
        target_processing_time REAL,
        response_processing_time REAL,
        elb_status_code INTEGER,
        target_status_code INTEGER,
        received_bytes INTEGER,
        sent_bytes INTEGER,
        request_verb TEXT,
        request_url TEXT,
        request_protocol TEXT,
        user_agent TEXT,
        ssl_cipher TEXT,
        ssl_protocol TEXT,
        target_group_arn TEXT,
        trace_id TEXT,
        domain_name TEXT,
        chosen_cert_arn TEXT,
        matched_rule_priority INTEGER,
        request_creation_time DATETIME,
        actions_executed TEXT,
        redirect_url TEXT,
        error_reason TEXT,
        target_port_list TEXT,
        target_status_code_list TEXT,
        classification TEXT,
        classification_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await connection.execute(createTableSql);
    
    // Create indexes for common query patterns
    const indexes = [
      // Primary index for timestamp-based queries (most common)
      'CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp)',
      
      // Index for URL pattern analysis
      'CREATE INDEX idx_log_entries_request_url ON log_entries(request_url)',
      
      // Index for status code analysis
      'CREATE INDEX idx_log_entries_elb_status_code ON log_entries(elb_status_code)',
      
      // Index for client IP analysis
      'CREATE INDEX idx_log_entries_client_ip ON log_entries(client_ip)',
      
      // Index for domain-based analysis
      'CREATE INDEX idx_log_entries_domain_name ON log_entries(domain_name)',
      
      // Composite index for time-range + status code queries
      'CREATE INDEX idx_log_entries_timestamp_status ON log_entries(timestamp, elb_status_code)',
      
      // Composite index for time-range + URL queries
      'CREATE INDEX idx_log_entries_timestamp_url ON log_entries(timestamp, request_url)',
      
      // Index for target status code analysis
      'CREATE INDEX idx_log_entries_target_status_code ON log_entries(target_status_code)'
    ];
    
    for (const indexSql of indexes) {
      await connection.execute(indexSql);
    }
  },
  
  async down(connection: DatabaseConnection): Promise<void> {
    // Drop indexes first
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_log_entries_timestamp',
      'DROP INDEX IF EXISTS idx_log_entries_request_url',
      'DROP INDEX IF EXISTS idx_log_entries_elb_status_code',
      'DROP INDEX IF EXISTS idx_log_entries_client_ip',
      'DROP INDEX IF EXISTS idx_log_entries_domain_name',
      'DROP INDEX IF EXISTS idx_log_entries_timestamp_status',
      'DROP INDEX IF EXISTS idx_log_entries_timestamp_url',
      'DROP INDEX IF EXISTS idx_log_entries_target_status_code'
    ];
    
    for (const dropIndexSql of dropIndexes) {
      await connection.execute(dropIndexSql);
    }
    
    // Drop the table
    await connection.execute('DROP TABLE IF EXISTS log_entries');
  }
};