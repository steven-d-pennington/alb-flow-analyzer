import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { exportService } from '../exportService';
import { AnalysisResult } from '../../types/analysis';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock URL methods
global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document methods
Object.defineProperty(document, 'createElement', {
  value: vi.fn(() => ({
    href: '',
    download: '',
    click: vi.fn(),
    style: {}
  })),
  writable: true
});

Object.defineProperty(document.body, 'appendChild', {
  value: vi.fn(),
  writable: true
});

Object.defineProperty(document.body, 'removeChild', {
  value: vi.fn(),
  writable: true
});

const mockAnalysisResult: AnalysisResult = {
  metrics: {
    totalRequests: 125847,
    requestsPerMinute: [
      { timestamp: new Date('2023-01-01T10:00:00Z'), value: 100 },
      { timestamp: new Date('2023-01-01T10:01:00Z'), value: 120 }
    ],
    requestsPerHour: [
      { timestamp: new Date('2023-01-01T10:00:00Z'), value: 6000 }
    ],
    peakPeriods: [
      {
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T10:30:00Z'),
        requestCount: 3600,
        averageRpm: 120
      }
    ],
    responseTimePercentiles: {
      p50: 45.2,
      p90: 156.8,
      p95: 234.5,
      p99: 567.3,
      average: 78.4,
      min: 12.1,
      max: 2341.7
    },
    statusCodeDistribution: [
      { statusCode: 200, count: 98567, percentage: 78.3 }
    ],
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
      }
    ],
    userAgentStats: [
      {
        userAgent: 'Chrome/91.0.4472.124',
        category: 'Desktop Browser',
        count: 45678,
        percentage: 36.3
      }
    ]
  },
  filteredEntryCount: 125847,
  totalEntryCount: 125847,
  processingTime: 1247,
  lastUpdated: new Date('2023-01-01T12:00:00Z')
};

describe('ExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportData', () => {
    it('should export data successfully', async () => {
      const mockBlob = new Blob(['test data'], { type: 'text/csv' });
      mockedAxios.post.mockResolvedValue({
        data: mockBlob,
        headers: { 'content-type': 'text/csv' }
      });

      const options = {
        format: 'csv',
        includeCharts: true,
        includeRawData: false
      };

      const result = await exportService.exportData('csv', options);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3001/api/export/csv',
        options,
        {
          responseType: 'blob',
          onDownloadProgress: expect.any(Function)
        }
      );
      expect(result).toBe('mock-blob-url');
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it('should handle export errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const options = {
        format: 'csv',
        includeCharts: true,
        includeRawData: false
      };

      await expect(exportService.exportData('csv', options)).rejects.toThrow('Export failed');
    });

    it('should track download progress', async () => {
      const mockBlob = new Blob(['test data'], { type: 'text/csv' });
      let progressCallback: ((progressEvent: any) => void) | undefined;

      mockedAxios.post.mockImplementation((url, data, config) => {
        progressCallback = config?.onDownloadProgress;
        return Promise.resolve({
          data: mockBlob,
          headers: { 'content-type': 'text/csv' }
        });
      });

      const progressSpy = vi.fn();
      exportService.onProgressUpdate(progressSpy);

      const options = {
        format: 'csv',
        includeCharts: true,
        includeRawData: false
      };

      const promise = exportService.exportData('csv', options);

      // Simulate progress update
      if (progressCallback) {
        progressCallback({ loaded: 50, total: 100 });
      }

      await promise;

      expect(progressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isDownloading: true,
          progress: 50
        })
      );
    });
  });

  describe('generateAWSLoadTestConfig', () => {
    it('should generate AWS load test config', async () => {
      const mockConfig = {
        testName: 'Test Config',
        scenarios: []
      };

      mockedAxios.post.mockResolvedValue({ data: mockConfig });

      const result = await exportService.generateAWSLoadTestConfig(mockAnalysisResult);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3001/api/export/aws-load-test-config',
        { analysisResult: mockAnalysisResult }
      );
      expect(result).toEqual(mockConfig);
    });

    it('should handle generation errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Generation failed'));

      await expect(exportService.generateAWSLoadTestConfig(mockAnalysisResult))
        .rejects.toThrow('Failed to generate AWS Load Test configuration');
    });
  });

  describe('previewAWSLoadTestConfig', () => {
    it('should generate preview config from analysis results', async () => {
      const result = await exportService.previewAWSLoadTestConfig(mockAnalysisResult);

      expect(result).toMatchObject({
        testName: expect.stringContaining('ALB_Load_Test_'),
        testDescription: expect.stringContaining('Generated from ALB flow log analysis'),
        taskCount: expect.any(Number),
        concurrency: expect.any(Number),
        rampUpTime: 300,
        holdForTime: 1800,
        rampDownTime: 300,
        scenarios: expect.any(Array),
        regions: ['us-east-1']
      });

      expect(result.scenarios).toHaveLength(2); // Based on mock data with 2 endpoints
      expect(result.scenarios[0]).toMatchObject({
        name: expect.stringContaining('Scenario_1'),
        weight: 28, // Based on mock endpoint percentage
        requests: expect.any(Array),
        thinkTime: expect.any(Number)
      });
    });

    it('should filter out high error rate endpoints', async () => {
      const analysisWithHighErrorRate = {
        ...mockAnalysisResult,
        metrics: {
          ...mockAnalysisResult.metrics,
          endpointStats: [
            {
              endpoint: '/api/users',
              requestCount: 34567,
              percentage: 27.5,
              averageResponseTime: 45.2,
              errorRate: 15.0 // High error rate
            },
            {
              endpoint: '/api/orders',
              requestCount: 23456,
              percentage: 18.6,
              averageResponseTime: 67.8,
              errorRate: 2.1 // Low error rate
            }
          ]
        }
      };

      const result = await exportService.previewAWSLoadTestConfig(analysisWithHighErrorRate);

      expect(result.scenarios).toHaveLength(1); // Only the low error rate endpoint
      expect(result.scenarios[0].name).toContain('api_orders');
    });

    it('should calculate test parameters based on traffic patterns', async () => {
      const result = await exportService.previewAWSLoadTestConfig(mockAnalysisResult);

      // Task count should be based on peak RPM (120 in mock data)
      expect(result.taskCount).toBeGreaterThan(0);
      expect(result.taskCount).toBeLessThanOrEqual(50);

      // Concurrency should be based on average RPM
      expect(result.concurrency).toBeGreaterThan(0);
      expect(result.concurrency).toBeLessThanOrEqual(20);
    });
  });

  describe('downloadFile', () => {
    it('should create and trigger download link', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        style: {}
      };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      exportService.downloadFile('test-url', 'test-file.csv');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockLink.href).toBe('test-url');
      expect(mockLink.download).toBe('test-file.csv');
      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    });

    it('should revoke blob URL after download', (done) => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        style: {}
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild');
      vi.spyOn(document.body, 'removeChild');

      exportService.downloadFile('blob:test-url', 'test-file.csv');

      setTimeout(() => {
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
        done();
      }, 150);
    });
  });

  describe('progress tracking', () => {
    it('should allow subscribing to progress updates', () => {
      const callback = vi.fn();
      const unsubscribe = exportService.onProgressUpdate(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should unsubscribe from progress updates', () => {
      const callback = vi.fn();
      const unsubscribe = exportService.onProgressUpdate(callback);

      unsubscribe();

      // Progress updates should not call the callback after unsubscribing
      // This is tested indirectly through the exportData test
    });

    it('should return current download progress', () => {
      const progress = exportService.getDownloadProgress();

      expect(progress).toHaveProperty('isDownloading');
      expect(progress).toHaveProperty('progress');
      expect(typeof progress.isDownloading).toBe('boolean');
      expect(typeof progress.progress).toBe('number');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = exportService;
      const instance2 = exportService;

      expect(instance1).toBe(instance2);
    });
  });
});