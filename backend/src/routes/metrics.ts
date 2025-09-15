/**
 * Metrics API routes for pre-computed analytics and metrics processing
 * 
 * This routes file provides endpoints for:
 * - Triggering metrics pre-processing
 * - Retrieving pre-computed dashboard metrics  
 * - Managing metrics processing status
 * - Accessing optimized analytics data
 */

import { Router, Request, Response } from 'express';
import { MetricsProcessor, MetricsProcessingOptions } from '../metrics/MetricsProcessor';
import { createDataStore } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { DatabaseConnection } from '../database/types';

const router = Router();

// Initialize database connection for metrics processor
let metricsProcessor: MetricsProcessor | null = null;

const initializeMetricsProcessor = async () => {
    if (!metricsProcessor) {
        try {
            console.log('Initializing metrics processor...');
            const config = getDatabaseConfig();
            const factory = ConnectionFactory.getInstance();
            const connectionPool = await factory.createPool(config);
            const dataStore = await createDataStore(connectionPool);
            metricsProcessor = new MetricsProcessor(connectionPool, dataStore);
            console.log('Metrics processor initialized successfully');
        } catch (error) {
            console.error('Failed to initialize metrics processor:', error);
            throw error;
        }
    }
    return metricsProcessor;
};

/**
 * Helper function to execute database queries with proper connection management
 */
async function executeWithConnection<T>(
    queryFn: (connection: DatabaseConnection) => Promise<T>
): Promise<T> {
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const connection = await connectionPool.acquire();
    
    try {
        return await queryFn(connection);
    } finally {
        await connectionPool.release(connection);
    }
}

/**
 * POST /api/metrics/process
 * Trigger metrics pre-processing
 */
router.post('/process', async (req: Request, res: Response) => {
    try {
        const processor = await initializeMetricsProcessor();
        const options: MetricsProcessingOptions = {
            batchSize: req.body.batchSize || 10000,
            forceFullReprocess: req.body.forceFullReprocess || false,
            startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
            endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
            skipTables: req.body.skipTables || [],
            parallel: req.body.parallel !== false // Default to true
        };

        console.log('Starting metrics processing with options:', options);
        const result = await processor.processAllMetrics(options);

        res.json({
            success: true,
            message: 'Metrics processing completed',
            result: {
                totalRecordsProcessed: result.totalRecordsProcessed,
                totalProcessingTimeMs: result.totalProcessingTimeMs,
                tablesProcessed: result.tablesProcessed.length,
                errors: result.errors
            },
            details: result.tablesProcessed
        });

    } catch (error) {
        console.error('Error processing metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process metrics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/metrics/status
 * Get metrics processing status for all tables
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const result = await executeWithConnection(async (connection) => {
            return await connection.query(`
                SELECT 
                    table_name,
                    last_processed_timestamp,
                    records_processed,
                    processing_duration_ms,
                    status,
                    error_message,
                    updated_at
                FROM metrics_processing_status
                ORDER BY updated_at DESC
            `);
        });

        res.json({
            success: true,
            processingStatus: result.rows,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error getting metrics status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get metrics status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/metrics/dashboard
 * Get optimized dashboard metrics from pre-computed tables
 */
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const timeRange = req.query.timeRange as string || '24h';
        const endDate = new Date();
        let startDate = new Date();

        // Calculate start date based on time range
        switch (timeRange) {
            case '1h':
                startDate.setHours(endDate.getHours() - 1);
                break;
            case '24h':
                startDate.setDate(endDate.getDate() - 1);
                break;
            case '7d':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(endDate.getDate() - 30);
                break;
            default:
                startDate.setDate(endDate.getDate() - 1); // Default 24h
        }

        const dashboardMetrics = await executeWithConnection(async (connection) => {
            // Get traffic overview
            const trafficOverview = await connection.query(`
                SELECT 
                    SUM(request_count) as total_requests,
                    AVG(response_time_avg) as avg_response_time,
                    AVG(error_rate) as avg_error_rate,
                    SUM(unique_connections) as total_unique_connections
                FROM metrics_traffic_hourly
                WHERE timestamp_hour BETWEEN $1 AND $2
            `, [startDate, endDate]);

            // Get traffic time series based on range
            const timeSeriesTable = timeRange === '1h' ? 'metrics_traffic_minutely' : 'metrics_traffic_hourly';
            const timeField = timeRange === '1h' ? 'timestamp_minute' : 'timestamp_hour';
            
            const trafficTimeSeries = await connection.query(`
                SELECT 
                    ${timeField} as timestamp,
                    request_count,
                    response_time_avg,
                    error_rate
                FROM ${timeSeriesTable}
                WHERE ${timeField} BETWEEN $1 AND $2
                ORDER BY ${timeField}
            `, [startDate, endDate]);

            // Get top endpoints from daily metrics
            const topEndpoints = await connection.query(`
                SELECT 
                    endpoint_normalized as endpoint,
                    SUM(request_count) as request_count,
                    AVG(response_time_avg) as avg_response_time,
                    AVG(error_rate) as error_rate
                FROM metrics_endpoints_daily
                WHERE date_day BETWEEN $1::date AND $2::date
                GROUP BY endpoint_normalized
                ORDER BY SUM(request_count) DESC
                LIMIT 20
            `, [startDate, endDate]);

            // Get error patterns
            const errorPatterns = await connection.query(`
                SELECT 
                    status_code,
                    endpoint_normalized as endpoint,
                    SUM(error_count) as count,
                    MIN(first_occurrence) as first_occurrence,
                    MAX(last_occurrence) as last_occurrence
                FROM metrics_errors_hourly
                WHERE timestamp_hour BETWEEN $1 AND $2
                GROUP BY status_code, endpoint_normalized
                ORDER BY SUM(error_count) DESC
                LIMIT 10
            `, [startDate, endDate]);

            // Get session metrics
            const sessionMetrics = await connection.query(`
                SELECT 
                    COUNT(*) as total_sessions,
                    AVG(session_duration_seconds) as avg_session_duration,
                    AVG(request_count) as avg_requests_per_session,
                    COUNT(*) FILTER (WHERE bounce_session = true)::REAL / COUNT(*) * 100 as bounce_rate
                FROM metrics_sessions
                WHERE date_day BETWEEN $1::date AND $2::date
            `, [startDate, endDate]);

            return {
                overview: {
                    totalRequests: parseInt(trafficOverview.rows[0]?.total_requests || '0'),
                    avgResponseTime: parseFloat(trafficOverview.rows[0]?.avg_response_time || '0'),
                    avgErrorRate: parseFloat(trafficOverview.rows[0]?.avg_error_rate || '0'),
                    uniqueConnections: parseInt(trafficOverview.rows[0]?.total_unique_connections || '0'),
                    totalSessions: parseInt(sessionMetrics.rows[0]?.total_sessions || '0'),
                    avgSessionDuration: parseFloat(sessionMetrics.rows[0]?.avg_session_duration || '0'),
                    avgRequestsPerSession: parseFloat(sessionMetrics.rows[0]?.avg_requests_per_session || '0'),
                    bounceRate: parseFloat(sessionMetrics.rows[0]?.bounce_rate || '0')
                },
                timeSeries: trafficTimeSeries.rows.map(row => ({
                    timestamp: row.timestamp,
                    requestCount: row.request_count,
                    avgResponseTime: row.response_time_avg,
                    errorRate: row.error_rate
                })),
                topEndpoints: topEndpoints.rows,
                errorPatterns: errorPatterns.rows.map(row => ({
                    statusCode: row.status_code,
                    endpoint: row.endpoint,
                    count: row.count,
                    timeRange: {
                        start: row.first_occurrence,
                        end: row.last_occurrence
                    }
                })),
                timeRange,
                generatedAt: new Date().toISOString()
            };
        });

        res.json({
            success: true,
            metrics: dashboardMetrics
        });

    } catch (error) {
        console.error('Error getting dashboard metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dashboard metrics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/metrics/sessions
 * Get detailed session analytics
 */
router.get('/sessions', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
        const offset = (page - 1) * limit;

        const days = parseInt(req.query.days as string) || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const sessionData = await executeWithConnection(async (connection) => {
            // Get paginated sessions
            const sessions = await connection.query(`
                SELECT 
                    connection_id,
                    session_start,
                    session_end,
                    session_duration_seconds,
                    request_count,
                    page_views,
                    bounce_session,
                    error_rate,
                    avg_response_time,
                    user_agent_category,
                    user_agent_normalized,
                    total_bytes_sent,
                    total_bytes_received,
                    endpoints_visited,
                    first_request_url,
                    last_request_url
                FROM metrics_sessions
                WHERE date_day >= $1::date
                ORDER BY session_start DESC
                LIMIT $2 OFFSET $3
            `, [startDate, limit, offset]);

            // Get total count for pagination
            const totalResult = await connection.query(`
                SELECT COUNT(*) as total
                FROM metrics_sessions
                WHERE date_day >= $1::date
            `, [startDate]);

            return {
                sessions: sessions.rows,
                total: parseInt(totalResult.rows[0]?.total || '0')
            };
        });

        const totalPages = Math.ceil(sessionData.total / limit);

        res.json({
            success: true,
            sessions: sessionData.sessions,
            pagination: {
                page,
                limit,
                total: sessionData.total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error('Error getting session metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session metrics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * DELETE /api/metrics/reset
 * Clear all pre-computed metrics (useful for testing)
 */
router.delete('/reset', async (req: Request, res: Response) => {
    try {
        const tables = [
            'metrics_summary',
            'metrics_status_codes_hourly',
            'metrics_user_agents_daily',
            'metrics_errors_hourly',
            'metrics_endpoints_daily',
            'metrics_sessions',
            'metrics_traffic_daily',
            'metrics_traffic_hourly',
            'metrics_traffic_minutely',
            'metrics_processing_status'
        ];

        await executeWithConnection(async (connection) => {
            const clearPromises = tables.map(table => 
                connection.query(`DELETE FROM ${table}`)
            );
            await Promise.all(clearPromises);
        });

        res.json({
            success: true,
            message: 'All metrics tables cleared successfully',
            tablesCleared: tables
        });

    } catch (error) {
        console.error('Error resetting metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset metrics',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;