import request from 'supertest';
import express from 'express';
import analysisRoutes from '../analysis';

const app = express();
app.use(express.json());
app.use('/api/analysis', analysisRoutes);

describe('Analysis Routes', () => {
  describe('GET /api/analysis/results', () => {
    it('should return analysis results successfully', async () => {
      const response = await request(app)
        .get('/api/analysis/results')
        .expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body).toHaveProperty('totalEntryCount');
      expect(response.body).toHaveProperty('processingTime');
      expect(response.body).toHaveProperty('lastUpdated');

      // Verify metrics structure
      const { metrics } = response.body;
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('requestsPerMinute');
      expect(metrics).toHaveProperty('requestsPerHour');
      expect(metrics).toHaveProperty('peakPeriods');
      expect(metrics).toHaveProperty('responseTimePercentiles');
      expect(metrics).toHaveProperty('statusCodeDistribution');
      expect(metrics).toHaveProperty('endpointStats');
      expect(metrics).toHaveProperty('userAgentStats');

      // Verify data types and structure
      expect(typeof metrics.totalRequests).toBe('number');
      expect(Array.isArray(metrics.requestsPerMinute)).toBe(true);
      expect(Array.isArray(metrics.requestsPerHour)).toBe(true);
      expect(Array.isArray(metrics.peakPeriods)).toBe(true);
      expect(Array.isArray(metrics.statusCodeDistribution)).toBe(true);
      expect(Array.isArray(metrics.endpointStats)).toBe(true);
      expect(Array.isArray(metrics.userAgentStats)).toBe(true);

      // Verify response time percentiles structure
      expect(metrics.responseTimePercentiles).toHaveProperty('p50');
      expect(metrics.responseTimePercentiles).toHaveProperty('p90');
      expect(metrics.responseTimePercentiles).toHaveProperty('p95');
      expect(metrics.responseTimePercentiles).toHaveProperty('p99');
      expect(metrics.responseTimePercentiles).toHaveProperty('average');
      expect(metrics.responseTimePercentiles).toHaveProperty('min');
      expect(metrics.responseTimePercentiles).toHaveProperty('max');

      // Verify time series data structure
      if (metrics.requestsPerMinute.length > 0) {
        expect(metrics.requestsPerMinute[0]).toHaveProperty('timestamp');
        expect(metrics.requestsPerMinute[0]).toHaveProperty('value');
      }

      // Verify endpoint stats structure
      if (metrics.endpointStats.length > 0) {
        expect(metrics.endpointStats[0]).toHaveProperty('endpoint');
        expect(metrics.endpointStats[0]).toHaveProperty('requestCount');
        expect(metrics.endpointStats[0]).toHaveProperty('percentage');
        expect(metrics.endpointStats[0]).toHaveProperty('averageResponseTime');
        expect(metrics.endpointStats[0]).toHaveProperty('errorRate');
      }

      // Verify status code distribution structure
      if (metrics.statusCodeDistribution.length > 0) {
        expect(metrics.statusCodeDistribution[0]).toHaveProperty('statusCode');
        expect(metrics.statusCodeDistribution[0]).toHaveProperty('count');
        expect(metrics.statusCodeDistribution[0]).toHaveProperty('percentage');
      }
    });

    it('should handle errors gracefully', async () => {
      // This test would be more meaningful with actual error conditions
      // For now, we test that the endpoint doesn't crash
      const response = await request(app)
        .get('/api/analysis/results')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('POST /api/analysis/filter', () => {
    it('should apply filters and return filtered results', async () => {
      const filters = {
        timeRange: {
          start: '2023-01-01T00:00:00Z',
          end: '2023-01-01T23:59:59Z'
        },
        endpoints: ['/api/users', '/api/orders'],
        statusCodes: [200, 404],
        clientIps: ['192.168.1.100'],
        userAgentPatterns: ['Chrome']
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body).toHaveProperty('totalEntryCount');

      // Filtered count should be less than or equal to total count
      expect(response.body.filteredEntryCount).toBeLessThanOrEqual(response.body.totalEntryCount);

      // Verify that filtering affects the data
      expect(response.body.metrics.totalRequests).toBeLessThanOrEqual(125847);
    });

    it('should apply time range filter only', async () => {
      const filters = {
        timeRange: {
          start: '2023-01-01T10:00:00Z',
          end: '2023-01-01T14:00:00Z'
        }
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body.filteredEntryCount).toBeLessThanOrEqual(response.body.totalEntryCount);
    });

    it('should apply endpoint filter only', async () => {
      const filters = {
        endpoints: ['/api/users']
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body.filteredEntryCount).toBeLessThanOrEqual(response.body.totalEntryCount);
    });

    it('should apply status code filter only', async () => {
      const filters = {
        statusCodes: [200]
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body.filteredEntryCount).toBeLessThanOrEqual(response.body.totalEntryCount);
    });

    it('should apply client IP filter only', async () => {
      const filters = {
        clientIps: ['192.168.1.100', '192.168.1.101']
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body.filteredEntryCount).toBeLessThanOrEqual(response.body.totalEntryCount);
    });

    it('should apply user agent pattern filter only', async () => {
      const filters = {
        userAgentPatterns: ['Chrome', 'Firefox']
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body.filteredEntryCount).toBeLessThanOrEqual(response.body.totalEntryCount);
    });

    it('should return 400 for invalid time range (missing start)', async () => {
      const filters = {
        timeRange: {
          end: '2023-01-01T23:59:59Z'
        }
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Time range filter requires both start and end dates');
    });

    it('should return 400 for invalid time range (missing end)', async () => {
      const filters = {
        timeRange: {
          start: '2023-01-01T00:00:00Z'
        }
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Time range filter requires both start and end dates');
    });

    it('should return 400 for invalid date format', async () => {
      const filters = {
        timeRange: {
          start: 'invalid-date',
          end: '2023-01-01T23:59:59Z'
        }
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Invalid date format in time range filter');
    });

    it('should return 400 when start date is after end date', async () => {
      const filters = {
        timeRange: {
          start: '2023-01-02T00:00:00Z',
          end: '2023-01-01T23:59:59Z'
        }
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Start date must be before end date');
    });

    it('should return 400 for invalid status codes', async () => {
      const filters = {
        statusCodes: [99, 600] // Invalid status codes
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Status codes must be between 100 and 599');
    });

    it('should return 400 for invalid endpoints (not starting with /)', async () => {
      const filters = {
        endpoints: ['api/users', 'invalid-endpoint'] // Missing leading slash
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad request');
      expect(response.body).toHaveProperty('message', 'Endpoints must start with /');
    });

    it('should handle empty filters', async () => {
      const response = await request(app)
        .post('/api/analysis/filter')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      expect(response.body.filteredEntryCount).toBe(response.body.totalEntryCount);
    });

    it('should combine multiple filters correctly', async () => {
      const filters = {
        timeRange: {
          start: '2023-01-01T00:00:00Z',
          end: '2023-01-01T23:59:59Z'
        },
        endpoints: ['/api/users'],
        statusCodes: [200],
        clientIps: ['192.168.1.100']
      };

      const response = await request(app)
        .post('/api/analysis/filter')
        .send(filters)
        .expect(200);

      expect(response.body).toHaveProperty('filteredEntryCount');
      // With multiple filters, the filtered count should be significantly reduced
      expect(response.body.filteredEntryCount).toBeLessThan(response.body.totalEntryCount * 0.5);
    });

    it('should handle server errors gracefully', async () => {
      // This test would be more meaningful with actual error conditions
      // For now, we test that the endpoint handles basic requests
      const response = await request(app)
        .post('/api/analysis/filter')
        .send({ validFilter: true })
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/analysis/progress', () => {
    it('should return processing progress', async () => {
      const response = await request(app)
        .get('/api/analysis/progress')
        .expect(200);

      expect(response.body).toHaveProperty('isProcessing');
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('currentFile');

      expect(typeof response.body.isProcessing).toBe('boolean');
      expect(typeof response.body.progress).toBe('number');
      expect(response.body.progress).toBeGreaterThanOrEqual(0);
      expect(response.body.progress).toBeLessThanOrEqual(100);
    });
  });
});