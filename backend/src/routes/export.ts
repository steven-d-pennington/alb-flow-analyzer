import { Router, Request, Response } from 'express';
import { createDataStore } from '../database/DataStore';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';
import { 
  paginationMiddleware, 
  validatePagination, 
  parsePaginationParams,
  streamPaginated,
  PaginationParams
} from '../utils/pagination';

const router = Router();

/**
 * Stream CSV export for very large datasets
 */
async function streamCsvExport(
  req: Request, 
  res: Response, 
  paginationParams: PaginationParams
): Promise<void> {
  const config = getDatabaseConfig();
  const factory = ConnectionFactory.getInstance();
  const connectionPool = await factory.createPool(config);
  const dataStore = await createDataStore(connectionPool);

  try {
    const totalCount = await dataStore.count();
    
    // Set response headers for streaming
    const filename = `alb-analysis-stream-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Total-Records', totalCount.toString());
    
    // Write CSV headers
    const headers = [
      'timestamp', 'client_ip', 'target_ip', 'request_processing_time', 'target_processing_time',
      'response_processing_time', 'elb_status_code', 'target_status_code', 'received_bytes',
      'sent_bytes', 'request_verb', 'request_url', 'request_protocol', 'user_agent',
      'target_group_arn', 'trace_id', 'domain_name'
    ];
    res.write(headers.join(',') + '\n');
    
    // Stream data in batches
    const batchSize = Math.min(paginationParams.limit, 5000); // Cap batch size for memory safety
    let processedRecords = 0;
    
    await streamPaginated(
      async (offset: number, limit: number) => {
        return await dataStore.query({ limit, offset });
      },
      totalCount,
      {
        batchSize,
        maxBatches: Math.ceil(totalCount / batchSize),
        onBatch: async (batch: any[], batchNumber: number) => {
          for (const entry of batch) {
            const row = [
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
              `"${entry.requestUrl.replace(/"/g, '""')}"`, // Escape quotes
              entry.requestProtocol,
              `"${entry.userAgent.replace(/"/g, '""')}"`, // Escape quotes
              entry.targetGroupArn,
              entry.traceId,
              entry.domainName
            ];
            res.write(row.join(',') + '\n');
            processedRecords++;
          }
          
          // Send progress update (optional, as comment in CSV)
          if (batchNumber % 10 === 0) {
            res.write(`# Progress: ${processedRecords}/${totalCount} records processed\n`);
          }
        },
        onError: (error: Error, batchNumber: number) => {
          console.error(`Error in batch ${batchNumber}:`, error);
          res.write(`# Error in batch ${batchNumber}: ${error.message}\n`);
        }
      }
    );
    
    res.end();
  } catch (error) {
    console.error('Error streaming CSV export:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Export failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } finally {
    await connectionPool.destroy();
  }
}

/**
 * GET /api/export/csv
 * Export analysis data as CSV with pagination and streaming support
 */
router.get('/csv', 
  validatePagination({ maxLimit: 100000, defaultLimit: 10000 }),
  paginationMiddleware({ maxLimit: 100000, defaultLimit: 10000 }),
  async (req: Request & { pagination?: PaginationParams }, res: Response) => {
  try {
    const { includeRawData = false, includeCharts = false, stream = false } = req.query;
    const paginationParams = req.pagination || parsePaginationParams(req.query, { maxLimit: 100000, defaultLimit: 10000 });
    
    console.log('Exporting CSV with options:', { includeRawData, includeCharts, stream, pagination: paginationParams });

    // For large datasets, use streaming approach
    if (stream === 'true' && includeRawData === 'true') {
      return await streamCsvExport(req, res, paginationParams);
    }

    // Generate paginated CSV data
    let csvData = '';
    
    // Initialize database connection for real data export
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const dataStore = await createDataStore(connectionPool);

    if (includeRawData === 'true') {
      // Get paginated raw log data from database
      const paginatedResult = await dataStore.queryPaginated(
        undefined, // No filters for now, could be extended
        paginationParams.page,
        paginationParams.limit
      );
      
      // Convert to CSV format
      const headers = [
        'timestamp', 'client_ip', 'target_ip', 'request_processing_time', 'target_processing_time',
        'response_processing_time', 'elb_status_code', 'target_status_code', 'received_bytes',
        'sent_bytes', 'request_verb', 'request_url', 'request_protocol', 'user_agent',
        'target_group_arn', 'trace_id', 'domain_name'
      ];
      
      csvData = headers.join(',') + '\n';
      
      for (const entry of paginatedResult.data) {
        const row = [
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
          `"${entry.requestUrl.replace(/"/g, '""')}"`, // Escape quotes in URLs
          entry.requestProtocol,
          `"${entry.userAgent.replace(/"/g, '""')}"`, // Escape quotes in user agent
          entry.targetGroupArn,
          entry.traceId,
          entry.domainName
        ];
        csvData += row.join(',') + '\n';
      }
      
      // Add pagination info as comment
      csvData = `# Page ${paginationParams.page} of ${Math.ceil(paginatedResult.totalCount / paginationParams.limit)} (${paginatedResult.data.length} of ${paginatedResult.totalCount} records)\n` + csvData;
    } else {
      // Summary metrics export
      csvData = `metric_type,metric_name,value,timestamp
traffic,total_requests,125847,2023-01-01T12:00:00Z
traffic,requests_per_minute_avg,156,2023-01-01T12:00:00Z
traffic,requests_per_minute_peak,285,2023-01-01T12:00:00Z
response_time,p50_ms,45.2,2023-01-01T12:00:00Z
response_time,p90_ms,156.8,2023-01-01T12:00:00Z
response_time,p95_ms,234.5,2023-01-01T12:00:00Z
response_time,p99_ms,567.3,2023-01-01T12:00:00Z
endpoint,/api/users,34567,2023-01-01T12:00:00Z
endpoint,/api/orders,23456,2023-01-01T12:00:00Z
endpoint,/api/products,18934,2023-01-01T12:00:00Z
status_code,200,98567,2023-01-01T12:00:00Z
status_code,404,8934,2023-01-01T12:00:00Z
status_code,500,3456,2023-01-01T12:00:00Z`;
    }

    const filename = `alb-analysis-page-${paginationParams.page}-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Add pagination headers
    res.setHeader('X-Pagination-Page', paginationParams.page.toString());
    res.setHeader('X-Pagination-Limit', paginationParams.limit.toString());
    res.setHeader('X-Pagination-Total-Pages', Math.ceil((await dataStore.count()) / paginationParams.limit).toString());
    
    res.send(csvData);
    
    // Clean up connection
    await connectionPool.destroy();
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to export CSV data'
    });
  }
});

/**
 * GET /api/export/json
 * Export analysis data as JSON with pagination support
 */
router.get('/json', 
  validatePagination({ maxLimit: 50000, defaultLimit: 5000 }),
  paginationMiddleware({ maxLimit: 50000, defaultLimit: 5000 }),
  async (req: Request & { pagination?: PaginationParams }, res: Response) => {
  try {
    const { includeRawData = false, includeCharts = false } = req.query;
    const paginationParams = req.pagination || parsePaginationParams(req.query, { maxLimit: 50000, defaultLimit: 5000 });
    
    console.log('Exporting JSON with options:', { includeRawData, includeCharts, pagination: paginationParams });
    
    // Initialize database connection for real data export
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const dataStore = await createDataStore(connectionPool);

    // Generate comprehensive JSON data based on options
    const jsonData: any = {
      exportedAt: new Date().toISOString(),
      exportOptions: {
        includeRawData: includeRawData === 'true',
        includeCharts: includeCharts === 'true'
      },
      summary: {
        totalRequests: 125847,
        timeRange: {
          start: '2023-01-01T00:00:00Z',
          end: '2023-01-01T23:59:59Z'
        },
        processingTime: 1247,
        filteredEntryCount: 125847
      },
      metrics: {
        traffic: {
          totalRequests: 125847,
          averageRpm: 156,
          peakRpm: 285,
          peakPeriods: [
            {
              startTime: '2023-01-01T14:00:00Z',
              endTime: '2023-01-01T14:30:00Z',
              requestCount: 8542,
              averageRpm: 285
            }
          ]
        },
        responseTime: {
          p50: 45.2,
          p90: 156.8,
          p95: 234.5,
          p99: 567.3,
          average: 78.4,
          min: 12.1,
          max: 2341.7
        },
        endpoints: [
          { endpoint: '/api/users', requests: 34567, percentage: 27.5, avgResponseTime: 45.2, errorRate: 1.2 },
          { endpoint: '/api/orders', requests: 23456, percentage: 18.6, avgResponseTime: 67.8, errorRate: 2.1 },
          { endpoint: '/api/products', requests: 18934, percentage: 15.0, avgResponseTime: 52.3, errorRate: 0.8 }
        ],
        statusCodes: [
          { statusCode: 200, count: 98567, percentage: 78.3 },
          { statusCode: 404, count: 8934, percentage: 7.1 },
          { statusCode: 500, count: 3456, percentage: 2.7 }
        ],
        userAgents: [
          { userAgent: 'Chrome/91.0.4472.124', category: 'Desktop Browser', count: 45678, percentage: 36.3 },
          { userAgent: 'Mobile Safari/14.1.1', category: 'Mobile Browser', count: 34567, percentage: 27.5 }
        ]
      }
    };

    if (includeCharts === 'true') {
      jsonData.charts = {
        trafficOverTime: [
          { timestamp: '2023-01-01T10:00:00Z', value: 100 },
          { timestamp: '2023-01-01T10:01:00Z', value: 120 },
          { timestamp: '2023-01-01T10:02:00Z', value: 95 }
        ],
        statusCodeDistribution: [
          { label: '200', value: 98567 },
          { label: '404', value: 8934 },
          { label: '500', value: 3456 }
        ]
      };
    }

    if (includeRawData === 'true') {
      // Get paginated raw data from database
      const paginatedResult = await dataStore.queryPaginated(
        undefined,
        paginationParams.page,
        paginationParams.limit
      );
      
      jsonData.rawData = paginatedResult.data;
      jsonData.pagination = {
        currentPage: paginatedResult.currentPage,
        totalPages: paginatedResult.totalPages,
        totalCount: paginatedResult.totalCount,
        hasMore: paginatedResult.hasMore,
        nextOffset: paginatedResult.nextOffset,
        processingTimeMs: paginatedResult.processingTimeMs
      };
    }
    
    // Clean up connection
    await connectionPool.destroy();

    const filename = `alb-analysis-page-${paginationParams.page}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Add pagination headers
    res.setHeader('X-Pagination-Page', paginationParams.page.toString());
    res.setHeader('X-Pagination-Limit', paginationParams.limit.toString());
    
    res.json(jsonData);
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to export JSON data'
    });
  }
});

/**
 * GET /api/export/report
 * Export analysis data as HTML report
 */
router.get('/report', (req: Request, res: Response) => {
  try {
    const { includeCharts = true } = req.query;
    console.log('Exporting HTML report with options:', { includeCharts });

    // Mock HTML report - in real implementation, this would generate a comprehensive HTML report
    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
    <title>ALB Flow Log Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
        .metric { margin: 20px 0; padding: 15px; border-left: 4px solid #007bff; }
        .chart-placeholder { background-color: #e9ecef; height: 200px; display: flex; align-items: center; justify-content: center; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ALB Flow Log Analysis Report</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p>Total Requests Analyzed: 125,847</p>
    </div>
    
    <div class="metric">
        <h2>Traffic Overview</h2>
        <p>Peak requests per minute: 285</p>
        <p>Average response time: 78.4ms</p>
        <p>Error rate: 2.7%</p>
    </div>
    
    <div class="chart-placeholder">
        [Traffic Pattern Chart Would Appear Here]
    </div>
    
    <h2>Top Endpoints</h2>
    <table>
        <tr>
            <th>Endpoint</th>
            <th>Requests</th>
            <th>Percentage</th>
            <th>Avg Response Time</th>
            <th>Error Rate</th>
        </tr>
        <tr>
            <td>/api/users</td>
            <td>34,567</td>
            <td>27.5%</td>
            <td>45.2ms</td>
            <td>1.2%</td>
        </tr>
        <tr>
            <td>/api/orders</td>
            <td>23,456</td>
            <td>18.6%</td>
            <td>67.8ms</td>
            <td>2.1%</td>
        </tr>
    </table>
    
    <h2>Status Code Distribution</h2>
    <table>
        <tr>
            <th>Status Code</th>
            <th>Count</th>
            <th>Percentage</th>
        </tr>
        <tr>
            <td>200</td>
            <td>98,567</td>
            <td>78.3%</td>
        </tr>
        <tr>
            <td>404</td>
            <td>8,934</td>
            <td>7.1%</td>
        </tr>
        <tr>
            <td>500</td>
            <td>3,456</td>
            <td>2.7%</td>
        </tr>
    </table>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename="alb-analysis-report.html"');
    res.send(htmlReport);
  } catch (error) {
    console.error('Error exporting HTML report:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to export HTML report'
    });
  }
});

/**
 * GET /api/export/aws-load-test
 * Export JMeter test plan based on ALB log analysis
 */
router.get('/aws-load-test', async (req: Request, res: Response) => {
  try {
    console.log('Exporting JMeter test plan based on real ALB data');

    // Get real analysis data from the database
    const { AnalysisEngine } = await import('../analysis/AnalysisEngine');
    const { ConnectionFactory } = await import('../database/ConnectionFactory');
    const { createDataStore } = await import('../database/DataStore');
    const { getDatabaseConfig } = await import('../config/database');

    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const dataStore = await createDataStore(connectionPool);
    const analysisEngine = new AnalysisEngine(dataStore);

    // Get comprehensive analysis
    const analysisResult = await analysisEngine.analyzeTrafficPatterns();

    const testName = `ALB_Load_Test_${new Date().toISOString().split('T')[0]}`;
    const testDescription = `Generated from ${analysisResult.metrics.totalRequests.toLocaleString()} ALB log entries. Peak traffic analysis included.`;

    // Extract real data for test plan generation
    const topEndpoints = analysisResult.metrics.endpointStats.slice(0, 10); // Top 10 endpoints
    const peakRpm = Math.max(...analysisResult.metrics.requestsPerMinute.map(rpm => rpm.value));
    const avgRpm = analysisResult.metrics.requestsPerMinute.reduce((sum, rpm) => sum + rpm.value, 0) / analysisResult.metrics.requestsPerMinute.length;

    // Calculate realistic thread count based on traffic
    const threadCount = Math.min(50, Math.max(5, Math.round(peakRpm / 20)));
    const rampUpTime = Math.max(300, Math.round(threadCount * 10)); // 10 seconds per thread minimum
    const testDuration = 1800; // 30 minutes

    // Extract domain from the most common requests
    const sampleUrl = topEndpoints[0]?.endpoint || '/';
    const domain = sampleUrl.includes('://') ? new URL(sampleUrl).hostname : 'your-domain.com';

    // Generate JMeter test plan XML with real data - Fixed for JMeter 5.6.3 compatibility
    const jmeterXml = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${testName}">
      <stringProp name="TestPlan.comments">${testDescription}</stringProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments">
        <collectionProp name="Arguments.arguments">
          <elementProp name="BASE_URL" elementType="Argument">
            <stringProp name="Argument.name">BASE_URL</stringProp>
            <stringProp name="Argument.value">${domain}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
    </TestPlan>
    <hashTree>
      <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager">
        <collectionProp name="CookieManager.cookies"/>
        <boolProp name="CookieManager.clearEachIteration">true</boolProp>
        <boolProp name="CookieManager.controlledByThreadGroup">false</boolProp>
      </CookieManager>
      <hashTree/>
      <Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="BASE_URL" elementType="Argument">
            <stringProp name="Argument.name">BASE_URL</stringProp>
            <stringProp name="Argument.value">${domain}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </Arguments>
      <hashTree/>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="ALB Load Test">
        <intProp name="ThreadGroup.num_threads">${threadCount}</intProp>
        <intProp name="ThreadGroup.ramp_time">${rampUpTime}</intProp>
        <longProp name="ThreadGroup.duration">${testDuration}</longProp>
        <longProp name="ThreadGroup.delay">0</longProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController">
          <stringProp name="LoopController.loops">1</stringProp>
          <boolProp name="LoopController.continue_forever">false</boolProp>
        </elementProp>
      </ThreadGroup>
      <hashTree>

        ${topEndpoints.map((endpoint, index) => {
      // Clean up endpoint path for JMeter compatibility
      let path = endpoint.endpoint;
      if (path.includes('?')) {
        path = path.split('?')[0];
      }
      if (path.includes('://')) {
        try {
          path = new URL(endpoint.endpoint).pathname;
        } catch (e) {
          // Keep original path if URL parsing fails
        }
      }

      const thinkTime = Math.max(100, Math.min(5000, Math.round(endpoint.averageResponseTime * 2))); // 2x response time

      return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${domain}${path}">
          <stringProp name="HTTPSampler.domain">${domain}</stringProp>
          <stringProp name="HTTPSampler.port">0</stringProp>
          <stringProp name="HTTPSampler.protocol">https</stringProp>
          <stringProp name="HTTPSampler.path">${path}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
        </HTTPSamplerProxy>
        <hashTree>
          <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header manager" enabled="true">
            <collectionProp name="HeaderManager.headers">
              <elementProp name="Host" elementType="Header">
                <stringProp name="Header.name">Host</stringProp>
                <stringProp name="Header.value">${domain}</stringProp>
              </elementProp>
              <elementProp name="User-Agent" elementType="Header">
                <stringProp name="Header.name">User-Agent</stringProp>
                <stringProp name="Header.value">Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0</stringProp>
              </elementProp>
              <elementProp name="Accept" elementType="Header">
                <stringProp name="Header.name">Accept</stringProp>
                <stringProp name="Header.value">text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8</stringProp>
              </elementProp>
              <elementProp name="Accept-Language" elementType="Header">
                <stringProp name="Header.name">Accept-Language</stringProp>
                <stringProp name="Header.value">en-US,en;q=0.5</stringProp>
              </elementProp>
              <elementProp name="Accept-Encoding" elementType="Header">
                <stringProp name="Header.name">Accept-Encoding</stringProp>
                <stringProp name="Header.value">gzip, deflate, br, zstd</stringProp>
              </elementProp>
              <elementProp name="Connection" elementType="Header">
                <stringProp name="Header.name">Connection</stringProp>
                <stringProp name="Header.value">keep-alive</stringProp>
              </elementProp>
              <elementProp name="Cache-Control" elementType="Header">
                <stringProp name="Header.name">Cache-Control</stringProp>
                <stringProp name="Header.value">no-cache</stringProp>
              </elementProp>
            </collectionProp>
          </HeaderManager>
          <hashTree/>
          <UniformRandomTimer guiclass="UniformRandomTimerGui" testclass="UniformRandomTimer" testname="Uniform Random Timer" enabled="true">
            <stringProp name="RandomTimer.range">${thinkTime / 2}</stringProp>
            <stringProp name="ConstantTimer.delay">${thinkTime}</stringProp>
          </UniformRandomTimer>
          <hashTree/>
        </hashTree>`;
    }).join('')}

      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="alb-load-test.jmx"');
    res.send(jmeterXml);
  } catch (error) {
    console.error('Error exporting JMeter test plan:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to export JMeter test plan'
    });
  }
});

/**
 * POST /api/export/aws-load-test-config
 * Generate AWS Load Test configuration preview (not for download)
 */
router.post('/aws-load-test-config', (req: Request, res: Response) => {
  try {
    const { analysisResult } = req.body;
    console.log('Generating AWS Load Test config preview');

    if (!analysisResult) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Analysis result is required'
      });
    }

    // Generate configuration based on analysis results
    const { metrics } = analysisResult;

    // Extract top endpoints for test scenarios (filter out high error rate endpoints)
    const topEndpoints = metrics.endpointStats
      .slice(0, 5)
      .filter((endpoint: any) => endpoint.errorRate < 10);

    const scenarios = topEndpoints.map((endpoint: any, index: number) => ({
      name: `Scenario_${index + 1}_${endpoint.endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
      weight: Math.round(endpoint.percentage),
      requests: [{
        method: 'GET',
        url: endpoint.endpoint,
        headers: {
          'User-Agent': 'AWS-Load-Test/1.0',
          'Accept': 'application/json, text/html, */*'
        },
        weight: 100
      }],
      thinkTime: Math.max(1, Math.round(endpoint.averageResponseTime / 100))
    }));

    // Calculate test parameters based on traffic patterns
    const peakRpm = metrics.requestsPerMinute.length > 0
      ? Math.max(...metrics.requestsPerMinute.map((rpm: any) => rpm.value))
      : 100;
    const avgRpm = metrics.requestsPerMinute.length > 0
      ? metrics.requestsPerMinute.reduce((sum: number, rpm: any) => sum + rpm.value, 0) / metrics.requestsPerMinute.length
      : 50;

    const config = {
      testName: `ALB_Load_Test_${new Date().toISOString().split('T')[0]}`,
      testDescription: `Generated from ALB flow log analysis. Peak RPM: ${Math.round(peakRpm)}, Average RPM: ${Math.round(avgRpm)}`,
      taskCount: Math.min(50, Math.max(1, Math.round(peakRpm / 100))),
      concurrency: Math.min(20, Math.max(1, Math.round(avgRpm / 50))),
      rampUpTime: 300,
      holdForTime: 1800,
      rampDownTime: 300,
      scenarios,
      regions: ['us-east-1']
    };

    res.json(config);
    return;
  } catch (error) {
    console.error('Error generating AWS Load Test config:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate AWS Load Test configuration'
    });
    return;
  }
});

export default router;