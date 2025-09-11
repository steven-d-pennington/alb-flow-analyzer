/**
 * Aggregation tables migration: Create summary tables for fast analytics
 */

import { Migration } from './types';
import { DatabaseConnection } from '../types';

export const createAggregationTablesMigration: Migration = {
  id: '003',
  name: 'create_aggregation_tables',
  
  async up(connection: DatabaseConnection): Promise<void> {
    console.log('Creating aggregation tables for performance optimization...');
    
    // Hourly summary table for time-based analysis
    const hourlySummaryTable = `
      CREATE TABLE IF NOT EXISTS log_entries_hourly_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hour_timestamp DATETIME NOT NULL,
        domain_name TEXT NOT NULL,
        request_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        avg_request_time REAL DEFAULT 0,
        avg_target_time REAL DEFAULT 0,
        avg_response_time REAL DEFAULT 0,
        total_bytes_received INTEGER DEFAULT 0,
        total_bytes_sent INTEGER DEFAULT 0,
        unique_clients INTEGER DEFAULT 0,
        status_code_2xx INTEGER DEFAULT 0,
        status_code_3xx INTEGER DEFAULT 0,
        status_code_4xx INTEGER DEFAULT 0,
        status_code_5xx INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await connection.execute(hourlySummaryTable);
    
    // Create indexes for hourly summary
    await connection.execute('CREATE INDEX IF NOT EXISTS idx_hourly_summary_time_domain ON log_entries_hourly_summary(hour_timestamp, domain_name)');
    await connection.execute('CREATE INDEX IF NOT EXISTS idx_hourly_summary_timestamp ON log_entries_hourly_summary(hour_timestamp)');
    
    // URL pattern summary table for endpoint analysis
    const urlPatternSummaryTable = `
      CREATE TABLE IF NOT EXISTS log_entries_url_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_pattern TEXT NOT NULL,
        domain_name TEXT NOT NULL,
        request_verb TEXT NOT NULL,
        request_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        avg_request_time REAL DEFAULT 0,
        avg_target_time REAL DEFAULT 0,
        min_request_time REAL DEFAULT 0,
        max_request_time REAL DEFAULT 0,
        total_bytes_received INTEGER DEFAULT 0,
        total_bytes_sent INTEGER DEFAULT 0,
        first_seen DATETIME,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await connection.execute(urlPatternSummaryTable);
    
    // Create indexes for URL summary
    await connection.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_url_summary_pattern_domain_verb ON log_entries_url_summary(url_pattern, domain_name, request_verb)');
    await connection.execute('CREATE INDEX IF NOT EXISTS idx_url_summary_pattern ON log_entries_url_summary(url_pattern)');
    
    // Client session summary table for user behavior analysis
    const sessionSummaryTable = `
      CREATE TABLE IF NOT EXISTS client_session_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_ip TEXT NOT NULL,
        user_agent_hash TEXT NOT NULL,
        session_date DATE NOT NULL,
        session_count INTEGER DEFAULT 0,
        total_requests INTEGER DEFAULT 0,
        unique_urls INTEGER DEFAULT 0,
        session_duration_avg REAL DEFAULT 0,
        session_duration_max REAL DEFAULT 0,
        error_rate REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await connection.execute(sessionSummaryTable);
    
    // Create indexes for session summary
    await connection.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_session_summary_client_date ON client_session_summary(client_ip, user_agent_hash, session_date)');
    await connection.execute('CREATE INDEX IF NOT EXISTS idx_session_summary_date ON client_session_summary(session_date)');
    
    // Error pattern summary table for error analysis
    const errorPatternTable = `
      CREATE TABLE IF NOT EXISTS error_pattern_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_pattern TEXT NOT NULL,
        elb_status_code INTEGER NOT NULL,
        target_status_code INTEGER,
        error_reason TEXT,
        url_pattern TEXT,
        occurrence_count INTEGER DEFAULT 0,
        first_occurrence DATETIME,
        last_occurrence DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await connection.execute(errorPatternTable);
    
    // Create indexes for error patterns
    await connection.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_error_pattern_unique ON error_pattern_summary(error_pattern, elb_status_code, target_status_code, url_pattern)');
    await connection.execute('CREATE INDEX IF NOT EXISTS idx_error_pattern_status ON error_pattern_summary(elb_status_code, target_status_code)');
    
    console.log('Aggregation tables created successfully');
  },
  
  async down(connection: DatabaseConnection): Promise<void> {
    console.log('Dropping aggregation tables...');
    
    const tables = [
      'log_entries_hourly_summary',
      'log_entries_url_summary', 
      'client_session_summary',
      'error_pattern_summary'
    ];
    
    for (const table of tables) {
      await connection.execute(`DROP TABLE IF EXISTS ${table}`);
    }
    
    console.log('Aggregation tables dropped successfully');
  }
};