/**
 * Migration 007: Create pre-computed metrics tables for dashboard performance
 * 
 * This migration creates optimized tables for storing pre-computed metrics
 * to eliminate real-time computation limits and support full dataset analysis.
 * 
 * Key design principles:
 * - Connection ID as primary session identifier (not client IP due to proxy)
 * - Time-based partitioning for efficient queries and maintenance
 * - Comprehensive indexes for dashboard query patterns
 * - Industry-standard web analytics metrics
 */

import { DatabaseConnection } from '../types';
import { Migration } from './types';

export const createMetricsTablesMigration: Migration = {
    id: '007_create_metrics_tables',
    name: 'Create pre-computed metrics tables for dashboard performance',
    up: async (connection: DatabaseConnection): Promise<void> => {
    console.log('Creating pre-computed metrics tables...');
    
    // Traffic metrics aggregated by time periods
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_traffic_minutely (
            id SERIAL PRIMARY KEY,
            timestamp_minute TIMESTAMP NOT NULL, -- Rounded to minute
            request_count INTEGER NOT NULL DEFAULT 0,
            response_time_p50 REAL NOT NULL DEFAULT 0,
            response_time_p95 REAL NOT NULL DEFAULT 0,
            response_time_avg REAL NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0, -- Percentage
            unique_connections INTEGER NOT NULL DEFAULT 0,
            bytes_sent BIGINT NOT NULL DEFAULT 0,
            bytes_received BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Indexes for efficient time-series queries
        CREATE INDEX IF NOT EXISTS idx_traffic_minutely_timestamp 
            ON metrics_traffic_minutely (timestamp_minute);
        CREATE INDEX IF NOT EXISTS idx_traffic_minutely_created 
            ON metrics_traffic_minutely (created_at);
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_traffic_hourly (
            id SERIAL PRIMARY KEY,
            timestamp_hour TIMESTAMP NOT NULL, -- Rounded to hour
            request_count INTEGER NOT NULL DEFAULT 0,
            response_time_p50 REAL NOT NULL DEFAULT 0,
            response_time_p90 REAL NOT NULL DEFAULT 0,
            response_time_p95 REAL NOT NULL DEFAULT 0,
            response_time_p99 REAL NOT NULL DEFAULT 0,
            response_time_avg REAL NOT NULL DEFAULT 0,
            response_time_min REAL NOT NULL DEFAULT 0,
            response_time_max REAL NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0,
            unique_connections INTEGER NOT NULL DEFAULT 0,
            unique_endpoints INTEGER NOT NULL DEFAULT 0,
            unique_user_agents INTEGER NOT NULL DEFAULT 0,
            bytes_sent BIGINT NOT NULL DEFAULT 0,
            bytes_received BIGINT NOT NULL DEFAULT 0,
            peak_rpm INTEGER NOT NULL DEFAULT 0, -- Peak requests per minute in this hour
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_traffic_hourly_timestamp 
            ON metrics_traffic_hourly (timestamp_hour);
        CREATE INDEX IF NOT EXISTS idx_traffic_hourly_created 
            ON metrics_traffic_hourly (created_at);
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_traffic_daily (
            id SERIAL PRIMARY KEY,
            date_day DATE NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0,
            response_time_p50 REAL NOT NULL DEFAULT 0,
            response_time_p90 REAL NOT NULL DEFAULT 0,
            response_time_p95 REAL NOT NULL DEFAULT 0,
            response_time_p99 REAL NOT NULL DEFAULT 0,
            response_time_avg REAL NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0,
            unique_connections INTEGER NOT NULL DEFAULT 0,
            unique_endpoints INTEGER NOT NULL DEFAULT 0,
            unique_user_agents INTEGER NOT NULL DEFAULT 0,
            unique_client_ips INTEGER NOT NULL DEFAULT 0,
            bytes_sent BIGINT NOT NULL DEFAULT 0,
            bytes_received BIGINT NOT NULL DEFAULT 0,
            peak_hour_rpm INTEGER NOT NULL DEFAULT 0,
            peak_hour TIMESTAMP, -- Hour with peak traffic
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_traffic_daily_date 
            ON metrics_traffic_daily (date_day);
        CREATE INDEX IF NOT EXISTS idx_traffic_daily_created 
            ON metrics_traffic_daily (created_at);
    `);

    // Connection-based session metrics (primary analytics dimension)
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_sessions (
            id SERIAL PRIMARY KEY,
            connection_id VARCHAR(255) NOT NULL,
            session_start TIMESTAMP NOT NULL,
            session_end TIMESTAMP NOT NULL,
            session_duration_seconds INTEGER NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0,
            page_views INTEGER NOT NULL DEFAULT 0, -- Unique endpoints visited
            bounce_session BOOLEAN NOT NULL DEFAULT false, -- Single request session
            error_count INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0,
            avg_response_time REAL NOT NULL DEFAULT 0,
            total_bytes_sent BIGINT NOT NULL DEFAULT 0,
            total_bytes_received BIGINT NOT NULL DEFAULT 0,
            user_agent_category VARCHAR(50), -- Desktop, Mobile, Bot, CLI
            user_agent_normalized VARCHAR(255),
            client_ip_last INET, -- Last known IP (may change due to proxy)
            endpoints_visited TEXT[], -- Array of endpoints
            status_codes_seen INTEGER[], -- Array of status codes encountered
            first_request_url TEXT,
            last_request_url TEXT,
            date_day DATE NOT NULL, -- For partitioning queries
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_sessions_connection_id 
            ON metrics_sessions (connection_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_date_day 
            ON metrics_sessions (date_day);
        CREATE INDEX IF NOT EXISTS idx_sessions_duration 
            ON metrics_sessions (session_duration_seconds);
        CREATE INDEX IF NOT EXISTS idx_sessions_request_count 
            ON metrics_sessions (request_count);
        CREATE INDEX IF NOT EXISTS idx_sessions_bounce 
            ON metrics_sessions (bounce_session);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_agent_category 
            ON metrics_sessions (user_agent_category);
    `);

    // Endpoint performance metrics over time
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_endpoints_daily (
            id SERIAL PRIMARY KEY,
            date_day DATE NOT NULL,
            endpoint_url TEXT NOT NULL,
            endpoint_normalized TEXT NOT NULL, -- Cleaned/parameterized version
            request_count INTEGER NOT NULL DEFAULT 0,
            unique_connections INTEGER NOT NULL DEFAULT 0,
            response_time_p50 REAL NOT NULL DEFAULT 0,
            response_time_p90 REAL NOT NULL DEFAULT 0,
            response_time_p95 REAL NOT NULL DEFAULT 0,
            response_time_p99 REAL NOT NULL DEFAULT 0,
            response_time_avg REAL NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0,
            status_2xx_count INTEGER NOT NULL DEFAULT 0,
            status_3xx_count INTEGER NOT NULL DEFAULT 0,
            status_4xx_count INTEGER NOT NULL DEFAULT 0,
            status_5xx_count INTEGER NOT NULL DEFAULT 0,
            bytes_sent_total BIGINT NOT NULL DEFAULT 0,
            bytes_received_total BIGINT NOT NULL DEFAULT 0,
            avg_request_size REAL NOT NULL DEFAULT 0,
            avg_response_size REAL NOT NULL DEFAULT 0,
            peak_hour_count INTEGER NOT NULL DEFAULT 0,
            peak_hour TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_endpoints_daily_date_endpoint 
            ON metrics_endpoints_daily (date_day, endpoint_normalized);
        CREATE INDEX IF NOT EXISTS idx_endpoints_daily_request_count 
            ON metrics_endpoints_daily (date_day, request_count DESC);
        CREATE INDEX IF NOT EXISTS idx_endpoints_daily_error_rate 
            ON metrics_endpoints_daily (date_day, error_rate DESC);
        CREATE INDEX IF NOT EXISTS idx_endpoints_daily_response_time 
            ON metrics_endpoints_daily (date_day, response_time_p95 DESC);
    `);

    // Error patterns and monitoring
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_errors_hourly (
            id SERIAL PRIMARY KEY,
            timestamp_hour TIMESTAMP NOT NULL,
            status_code INTEGER NOT NULL,
            endpoint_url TEXT NOT NULL,
            endpoint_normalized TEXT NOT NULL,
            error_count INTEGER NOT NULL DEFAULT 0,
            unique_connections INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0, -- Percentage of total requests
            avg_response_time REAL NOT NULL DEFAULT 0,
            sample_user_agents TEXT[], -- Up to 5 sample user agents
            sample_client_ips INET[], -- Up to 5 sample IPs
            first_occurrence TIMESTAMP NOT NULL,
            last_occurrence TIMESTAMP NOT NULL,
            is_pattern BOOLEAN NOT NULL DEFAULT false, -- Indicates recurring pattern
            alert_triggered BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_errors_hourly_timestamp_status 
            ON metrics_errors_hourly (timestamp_hour, status_code);
        CREATE INDEX IF NOT EXISTS idx_errors_hourly_endpoint_count 
            ON metrics_errors_hourly (endpoint_normalized, error_count DESC);
        CREATE INDEX IF NOT EXISTS idx_errors_hourly_patterns 
            ON metrics_errors_hourly (is_pattern, error_count DESC);
        CREATE INDEX IF NOT EXISTS idx_errors_hourly_alerts 
            ON metrics_errors_hourly (alert_triggered, timestamp_hour DESC);
    `);

    // User agent and client technology metrics
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_user_agents_daily (
            id SERIAL PRIMARY KEY,
            date_day DATE NOT NULL,
            user_agent_normalized VARCHAR(255) NOT NULL,
            user_agent_category VARCHAR(50) NOT NULL, -- Desktop, Mobile, Bot, CLI, Other
            user_agent_raw TEXT, -- Sample of original user agent
            request_count INTEGER NOT NULL DEFAULT 0,
            unique_connections INTEGER NOT NULL DEFAULT 0,
            market_share REAL NOT NULL DEFAULT 0, -- Percentage of total requests
            avg_response_time REAL NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            error_rate REAL NOT NULL DEFAULT 0,
            avg_session_duration REAL NOT NULL DEFAULT 0,
            avg_requests_per_session REAL NOT NULL DEFAULT 0,
            bounce_rate REAL NOT NULL DEFAULT 0, -- Percentage of single-request sessions
            bytes_sent_total BIGINT NOT NULL DEFAULT 0,
            bytes_received_total BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_agents_daily_date_category 
            ON metrics_user_agents_daily (date_day, user_agent_category);
        CREATE INDEX IF NOT EXISTS idx_user_agents_daily_market_share 
            ON metrics_user_agents_daily (date_day, market_share DESC);
        CREATE INDEX IF NOT EXISTS idx_user_agents_daily_error_rate 
            ON metrics_user_agents_daily (date_day, error_rate DESC);
    `);

    // Status code trends for monitoring
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_status_codes_hourly (
            id SERIAL PRIMARY KEY,
            timestamp_hour TIMESTAMP NOT NULL,
            status_code INTEGER NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0,
            percentage_of_total REAL NOT NULL DEFAULT 0,
            unique_connections INTEGER NOT NULL DEFAULT 0,
            unique_endpoints INTEGER NOT NULL DEFAULT 0,
            avg_response_time REAL NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_status_codes_hourly_timestamp_code 
            ON metrics_status_codes_hourly (timestamp_hour, status_code);
        CREATE INDEX IF NOT EXISTS idx_status_codes_hourly_count 
            ON metrics_status_codes_hourly (timestamp_hour, request_count DESC);
    `);

    // Summary metrics for dashboard overview
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_summary (
            id SERIAL PRIMARY KEY,
            metric_type VARCHAR(50) NOT NULL, -- 'overview', 'performance', 'errors', 'sessions'
            date_day DATE NOT NULL,
            metric_key VARCHAR(100) NOT NULL,
            metric_value REAL NOT NULL,
            metric_count INTEGER NOT NULL DEFAULT 0,
            metric_metadata JSONB, -- Additional context data
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_summary_type_date_key 
            ON metrics_summary (metric_type, date_day, metric_key);
        CREATE INDEX IF NOT EXISTS idx_summary_date_type 
            ON metrics_summary (date_day, metric_type);
    `);

    // Metadata table to track metrics processing status
    await connection.query(`
        CREATE TABLE IF NOT EXISTS metrics_processing_status (
            id SERIAL PRIMARY KEY,
            table_name VARCHAR(100) NOT NULL,
            last_processed_timestamp TIMESTAMP NOT NULL,
            records_processed INTEGER NOT NULL DEFAULT 0,
            processing_duration_ms INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'completed', -- 'running', 'completed', 'failed'
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_status_table 
            ON metrics_processing_status (table_name);
    `);

        console.log('✅ Pre-computed metrics tables created successfully');
        console.log('📊 Tables created:');
        console.log('   - metrics_traffic_minutely (real-time charts)');
        console.log('   - metrics_traffic_hourly (dashboard overview)');
        console.log('   - metrics_traffic_daily (historical analysis)');
        console.log('   - metrics_sessions (connection-based analytics)');
        console.log('   - metrics_endpoints_daily (endpoint performance)');
        console.log('   - metrics_errors_hourly (error monitoring)');
        console.log('   - metrics_user_agents_daily (client analysis)');
        console.log('   - metrics_status_codes_hourly (status trends)');
        console.log('   - metrics_summary (dashboard KPIs)');
        console.log('   - metrics_processing_status (system monitoring)');
    },
    down: async (connection: DatabaseConnection): Promise<void> => {
    console.log('Dropping pre-computed metrics tables...');
    
    const tables = [
        'metrics_processing_status',
        'metrics_summary',
        'metrics_status_codes_hourly',
        'metrics_user_agents_daily',
        'metrics_errors_hourly',
        'metrics_endpoints_daily',
        'metrics_sessions',
        'metrics_traffic_daily',
        'metrics_traffic_hourly',
        'metrics_traffic_minutely'
    ];
    
    for (const table of tables) {
        await connection.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
    }
        
        console.log('✅ Pre-computed metrics tables dropped');
    }
};