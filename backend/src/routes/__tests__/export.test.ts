import request from 'supertest';
import express from 'express';
import exportRoutes from '../export';

const app = express();
app.use(express.json());
app.use('/api/export', exportRoutes);

describe('Export Routes', () => {
  describe('GET /api/export/csv', () => {
    it('should export CSV summary data by default', async () => {
      const response = await request(app)
        .get('/api/export/csv')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('attachment; filename="alb-analysis.csv"');
      expect(response.text).toContain('metric_type,metric_name,value,timestamp');
      expect(response.text).toContain('traffic,total_requests,125847');
      expect(response.text).toContain('response_time,p50_ms,45.2');
      expect(response.text).toContain('endpoint,/api/users,34567');
      expect(response.text).toContain('status_code,200,98567');
    });

    it('should export raw CSV data when includeRawData=true', async () => {
      const response = await request(app)
        .get('/api/export/csv?includeRawData=true')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('attachment; filename="alb-analysis.csv"');
      expect(response.text).toContain('timestamp,client_ip,target_ip,request_processing_time');
      expect(response.text).toContain('192.168.1.100,10.0.1.50');
      expect(response.text).toContain('/api/users');
      expect(response.text).toContain('Mozilla/5.0');
    });

    it('should handle CSV export with charts option', async () => {
      const response = await request(app)
        .get('/api/export/csv?includeCharts=true')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    });

    it('should handle CSV export errors gracefully', async () => {
      // This test would be more meaningful with actual error conditions
      // For now, we test the basic functionality
      const response = await request(app)
        .get('/api/export/csv')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    });
  });

  describe('GET /api/export/json', () => {
    it('should export JSON data successfully', async () => {
      const response = await request(app)
        .get('/api/export/json')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toBe('attachment; filename="alb-analysis.json"');
      
      expect(response.body).toHaveProperty('exportedAt');
      expect(response.body).toHaveProperty('exportOptions');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('metrics');
      
      expect(response.body.summary).toHaveProperty('totalRequests', 125847);
      expect(response.body.metrics).toHaveProperty('traffic');
      expect(response.body.metrics).toHaveProperty('responseTime');
      expect(response.body.metrics).toHaveProperty('endpoints');
      expect(response.body.metrics).toHaveProperty('statusCodes');
      expect(response.body.metrics).toHaveProperty('userAgents');
    });

    it('should include charts when includeCharts=true', async () => {
      const response = await request(app)
        .get('/api/export/json?includeCharts=true')
        .expect(200);

      expect(response.body).toHaveProperty('charts');
      expect(response.body.charts).toHaveProperty('trafficOverTime');
      expect(response.body.charts).toHaveProperty('statusCodeDistribution');
      expect(Array.isArray(response.body.charts.trafficOverTime)).toBe(true);
      expect(Array.isArray(response.body.charts.statusCodeDistribution)).toBe(true);
    });

    it('should include raw data when includeRawData=true', async () => {
      const response = await request(app)
        .get('/api/export/json?includeRawData=true')
        .expect(200);

      expect(response.body).toHaveProperty('rawData');
      expect(Array.isArray(response.body.rawData)).toBe(true);
      
      if (response.body.rawData.length > 0) {
        const firstEntry = response.body.rawData[0];
        expect(firstEntry).toHaveProperty('timestamp');
        expect(firstEntry).toHaveProperty('clientIp');
        expect(firstEntry).toHaveProperty('targetIp');
        expect(firstEntry).toHaveProperty('requestProcessingTime');
        expect(firstEntry).toHaveProperty('elbStatusCode');
        expect(firstEntry).toHaveProperty('requestUrl');
      }
    });

    it('should include both charts and raw data when both options are true', async () => {
      const response = await request(app)
        .get('/api/export/json?includeCharts=true&includeRawData=true')
        .expect(200);

      expect(response.body).toHaveProperty('charts');
      expect(response.body).toHaveProperty('rawData');
      expect(response.body.exportOptions.includeCharts).toBe(true);
      expect(response.body.exportOptions.includeRawData).toBe(true);
    });
  });

  describe('GET /api/export/report', () => {
    it('should export HTML report successfully', async () => {
      const response = await request(app)
        .get('/api/export/report')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('attachment; filename="alb-analysis-report.html"');
      
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('ALB Flow Log Analysis Report');
      expect(response.text).toContain('Total Requests Analyzed: 125,847');
      expect(response.text).toContain('/api/users');
      expect(response.text).toContain('/api/orders');
    });

    it('should handle includeCharts option', async () => {
      const response = await request(app)
        .get('/api/export/report?includeCharts=false')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.text).toContain('ALB Flow Log Analysis Report');
    });
  });

  describe('GET /api/export/aws-load-test', () => {
    it('should export AWS Load Test config successfully', async () => {
      const response = await request(app)
        .get('/api/export/aws-load-test')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toBe('attachment; filename="aws-load-test-config.json"');
      
      expect(response.body).toHaveProperty('testName');
      expect(response.body).toHaveProperty('testDescription');
      expect(response.body).toHaveProperty('taskCount', 10);
      expect(response.body).toHaveProperty('concurrency', 5);
      expect(response.body).toHaveProperty('rampUpTime', 300);
      expect(response.body).toHaveProperty('holdForTime', 1800);
      expect(response.body).toHaveProperty('rampDownTime', 300);
      expect(response.body).toHaveProperty('scenarios');
      expect(response.body).toHaveProperty('regions', ['us-east-1']);
      
      expect(response.body.scenarios).toHaveLength(2);
      expect(response.body.scenarios[0]).toHaveProperty('name', 'Scenario_1_api_users');
      expect(response.body.scenarios[0]).toHaveProperty('weight', 28);
      expect(response.body.scenarios[0]).toHaveProperty('requests');
      expect(response.body.scenarios[0]).toHaveProperty('thinkTime', 1);
    });
  });

  describe('POST /api/export/aws-load-test-config', () => {
    const mockAnalysisResult = {
      metrics: {
        totalRequests: 125847,
        requestsPerMinute: [
          { timestamp: '2023-01-01T10:00:00Z', value: 100 },
          { timestamp: '2023-01-01T10:01:00Z', value: 120 },
          { timestamp: '2023-01-01T10:02:00Z', value: 200 }
        ],
        requestsPerHour: [
          { timestamp: '2023-01-01T10:00:00Z', value: 6000 }
        ],
        peakPeriods: [],
        responseTimePercentiles: {
          p50: 45.2,
          p90: 156.8,
          p95: 234.5,
          p99: 567.3,
          average: 78.4,
          min: 12.1,
          max: 2341.7
        },
        statusCodeDistribution: [],
        endpointStats: [
          {
            endpoint: '/api/users',
            requestCount: 34567,
            percentage: 27.5,
            averageResponseTime: 45.2,
            errorRate: 1.2
          },
          {
            endpoint: '/api/orders',
            requestCount: 23456,
            percentage: 18.6,
            averageResponseTime: 67.8,
            errorRate: 2.1
          },
          {
            endpoint: '/api/high-error',
            requestCount: 1000,
            percentage: 0.8,
            averageResponseTime: 100.0,
            errorRate: 15.0 // High error rate - should be filtered out
          }
        ],
        userAgentStats: []
      },
      filteredEntryCount: 125847,
      totalEntryCount: 125847,
      processingTime: 1247,
      lastUpdated: '2023-01-01T12:00:00Z'
    };

    it('should generate AWS Load Test config preview successfully', async () => {
      const response = await request(app)
        .post('/api/export/aws-load-test-config')
        .send({ analysisResult: mockAnalysisResult })
        .expect(200);

      expect(response.body).toHaveProperty('testName');
      expect(response.body.testName).toMatch(/ALB_Load_Test_\d{4}-\d{2}-\d{2}/);
      expect(response.body).toHaveProperty('testDescription');
      expect(response.body.testDescription).toContain('Peak RPM: 200');
      expect(response.body.testDescription).toContain('Average RPM: 140');
      
      expect(response.body).toHaveProperty('taskCount');
      expect(response.body.taskCount).toBeGreaterThan(0);
      expect(response.body.taskCount).toBeLessThanOrEqual(50);
      
      expect(response.body).toHaveProperty('concurrency');
      expect(response.body.concurrency).toBeGreaterThan(0);
      expect(response.body.concurrency).toBeLessThanOrEqual(20);
      
      expect(response.body).toHaveProperty('scenarios');
      expect(response.body.scenarios).toHaveLength(2); // High error rate endpoint should be filtered out
      
      expect(response.body.scenarios[0]).toHaveProperty('name', 'Scenario_1__api_users');
      expect(response.body.scenarios[0]).toHaveProperty('weight', 28);
      expect(response.body.scenarios[0]).toHaveProperty('thinkTime', 1);
      expect(response.body.scenarios[0].requests[0]).toHaveProperty('method', 'GET');
      expect(response.body.scenarios[0].requests[0]).toHaveProperty('url', '/api/users');
      
      expect(response.body.scenarios[1]).toHaveProperty('name', 'Scenario_2__api_orders');
      expect(response.body.scenarios[1]).toHaveProperty('weight', 19);
    });

    it('should return 400 when analysis result is missing', async () => {
      const response = await request(app)
        .post('/api/export/aws-load-test-config')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Analysis result is required');
    });

    it('should filter out high error rate endpoints', async () => {
      const response = await request(app)
        .post('/api/export/aws-load-test-config')
        .send({ analysisResult: mockAnalysisResult })
        .expect(200);

      // Should only have 2 scenarios (high error rate endpoint filtered out)
      expect(response.body.scenarios).toHaveLength(2);
      
      const scenarioNames = response.body.scenarios.map((s: any) => s.name);
      expect(scenarioNames).not.toContain('Scenario_3__api_high_error');
    });

    it('should calculate think time based on response time', async () => {
      const response = await request(app)
        .post('/api/export/aws-load-test-config')
        .send({ analysisResult: mockAnalysisResult })
        .expect(200);

      // Think time should be based on average response time / 100
      expect(response.body.scenarios[0].thinkTime).toBe(1); // 45.2 / 100 = 0.452, max(1, round(0.452)) = 1
      expect(response.body.scenarios[1].thinkTime).toBe(1); // 67.8 / 100 = 0.678, max(1, round(0.678)) = 1
    });

    it('should calculate task count and concurrency based on traffic', async () => {
      const response = await request(app)
        .post('/api/export/aws-load-test-config')
        .send({ analysisResult: mockAnalysisResult })
        .expect(200);

      // Task count should be based on peak RPM (200) / 100 = 2
      expect(response.body.taskCount).toBe(2);
      
      // Concurrency should be based on average RPM (140) / 50 = 2.8, rounded = 3
      expect(response.body.concurrency).toBe(3);
    });
  });
});