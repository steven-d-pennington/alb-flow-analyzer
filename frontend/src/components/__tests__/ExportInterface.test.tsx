import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ExportInterface from '../ExportInterface';
import { exportService } from '../../services/exportService';
import { AnalysisResult } from '../../types/analysis';

// Mock the export service
vi.mock('../../services/exportService', () => ({
  exportService: {
    onProgressUpdate: vi.fn(() => vi.fn()),
    exportData: vi.fn(),
    previewAWSLoadTestConfig: vi.fn(),
    downloadFile: vi.fn(),
    getDownloadProgress: vi.fn(() => ({
      isDownloading: false,
      progress: 0
    }))
  }
}));

const mockAnalysisResult: AnalysisResult = {
  metrics: {
    totalRequests: 125847,
    requestsPerMinute: [
      { timestamp: new Date('2023-01-01T10:00:00Z'), value: 100 },
      { timestamp: new Date('2023-01-01T10:01:00Z'), value: 120 }
    ],
    requestsPerHour: [
      { timestamp: new Date('2023-01-01T10:00:00Z'), value: 6000 },
      { timestamp: new Date('2023-01-01T11:00:00Z'), value: 7200 }
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
      { statusCode: 200, count: 98567, percentage: 78.3 },
      { statusCode: 404, count: 8934, percentage: 7.1 }
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

const mockAWSLoadTestConfig = {
  testName: 'ALB_Load_Test_2023-01-01',
  testDescription: 'Generated from ALB flow log analysis',
  taskCount: 10,
  concurrency: 5,
  rampUpTime: 300,
  holdForTime: 1800,
  rampDownTime: 300,
  scenarios: [
    {
      name: 'Scenario_1_api_users',
      weight: 28,
      requests: [{
        method: 'GET',
        url: '/api/users',
        headers: {
          'User-Agent': 'AWS-Load-Test/1.0',
          'Accept': 'application/json, text/html, */*'
        },
        weight: 100
      }],
      thinkTime: 1
    }
  ],
  regions: ['us-east-1']
};

describe('ExportInterface', () => {
  const defaultProps = {
    analysisResult: mockAnalysisResult,
    isVisible: true,
    onClose: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders export interface when visible', () => {
    render(<ExportInterface {...defaultProps} />);
    
    expect(screen.getByText('Export Analysis Results')).toBeInTheDocument();
    expect(screen.getByText('Export Format')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('HTML Report')).toBeInTheDocument();
    expect(screen.getByText('AWS Load Test Config')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    render(<ExportInterface {...defaultProps} isVisible={false} />);
    
    expect(screen.queryByText('Export Analysis Results')).not.toBeInTheDocument();
  });

  it('shows message when no analysis data is available', () => {
    render(<ExportInterface {...defaultProps} analysisResult={null} />);
    
    expect(screen.getByText('No analysis data available. Please process some log files first.')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ExportInterface {...defaultProps} onClose={onClose} />);
    
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows format selection', () => {
    render(<ExportInterface {...defaultProps} />);
    
    const jsonRadio = screen.getByDisplayValue('json');
    fireEvent.click(jsonRadio);
    
    expect(jsonRadio).toBeChecked();
  });

  it('shows export options for non-AWS formats', () => {
    render(<ExportInterface {...defaultProps} />);
    
    expect(screen.getByText('Export Options')).toBeInTheDocument();
    expect(screen.getByText('Include chart data')).toBeInTheDocument();
    expect(screen.getByText('Include raw log entries')).toBeInTheDocument();
  });

  it('hides export options for AWS Load Test format', () => {
    render(<ExportInterface {...defaultProps} />);
    
    const awsRadio = screen.getByDisplayValue('aws-load-test');
    fireEvent.click(awsRadio);
    
    expect(screen.queryByText('Export Options')).not.toBeInTheDocument();
    expect(screen.getByText('AWS Load Test Configuration')).toBeInTheDocument();
  });

  it('handles export button click', async () => {
    const mockExportData = vi.mocked(exportService.exportData);
    mockExportData.mockResolvedValue('mock-download-url');

    render(<ExportInterface {...defaultProps} />);
    
    const exportButton = screen.getByText('Export CSV');
    fireEvent.click(exportButton);
    
    await waitFor(() => {
      expect(mockExportData).toHaveBeenCalledWith('csv', {
        format: 'csv',
        includeCharts: true,
        includeRawData: false
      });
    });
  });

  it('handles export error', async () => {
    const mockExportData = vi.mocked(exportService.exportData);
    mockExportData.mockRejectedValue(new Error('Export failed'));

    render(<ExportInterface {...defaultProps} />);
    
    const exportButton = screen.getByText('Export CSV');
    fireEvent.click(exportButton);
    
    await waitFor(() => {
      expect(screen.getByText('Export failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('handles AWS Load Test config preview', async () => {
    const mockPreviewConfig = vi.mocked(exportService.previewAWSLoadTestConfig);
    mockPreviewConfig.mockResolvedValue(mockAWSLoadTestConfig);

    render(<ExportInterface {...defaultProps} />);
    
    // Select AWS Load Test format
    const awsRadio = screen.getByDisplayValue('aws-load-test');
    fireEvent.click(awsRadio);
    
    const previewButton = screen.getByText('Preview Configuration');
    fireEvent.click(previewButton);
    
    await waitFor(() => {
      expect(mockPreviewConfig).toHaveBeenCalledWith(mockAnalysisResult);
      expect(screen.getByText('Configuration Preview')).toBeInTheDocument();
      expect(screen.getByText('ALB_Load_Test_2023-01-01')).toBeInTheDocument();
    });
  });

  it('handles AWS config preview error', async () => {
    const mockPreviewConfig = vi.mocked(exportService.previewAWSLoadTestConfig);
    mockPreviewConfig.mockRejectedValue(new Error('Preview failed'));

    render(<ExportInterface {...defaultProps} />);
    
    // Select AWS Load Test format
    const awsRadio = screen.getByDisplayValue('aws-load-test');
    fireEvent.click(awsRadio);
    
    const previewButton = screen.getByText('Preview Configuration');
    fireEvent.click(previewButton);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to generate AWS Load Test configuration preview')).toBeInTheDocument();
    });
  });

  it('allows downloading AWS config after preview', async () => {
    const mockPreviewConfig = vi.mocked(exportService.previewAWSLoadTestConfig);
    const mockDownloadFile = vi.mocked(exportService.downloadFile);
    mockPreviewConfig.mockResolvedValue(mockAWSLoadTestConfig);

    render(<ExportInterface {...defaultProps} />);
    
    // Select AWS Load Test format and preview
    const awsRadio = screen.getByDisplayValue('aws-load-test');
    fireEvent.click(awsRadio);
    
    const previewButton = screen.getByText('Preview Configuration');
    fireEvent.click(previewButton);
    
    await waitFor(() => {
      expect(screen.getByText('Configuration Preview')).toBeInTheDocument();
    });
    
    const downloadButton = screen.getByText('Download Config');
    fireEvent.click(downloadButton);
    
    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.any(String),
      'alb_load_test_2023-01-01.json'
    );
  });

  it('updates export options when checkboxes are toggled', () => {
    render(<ExportInterface {...defaultProps} />);
    
    const chartsCheckbox = screen.getByLabelText('Include chart data');
    const rawDataCheckbox = screen.getByLabelText('Include raw log entries');
    
    expect(chartsCheckbox).toBeChecked();
    expect(rawDataCheckbox).not.toBeChecked();
    
    fireEvent.click(chartsCheckbox);
    fireEvent.click(rawDataCheckbox);
    
    expect(chartsCheckbox).not.toBeChecked();
    expect(rawDataCheckbox).toBeChecked();
  });

  it('displays analysis summary', () => {
    render(<ExportInterface {...defaultProps} />);
    
    expect(screen.getByText('Analysis Summary')).toBeInTheDocument();
    expect(screen.getAllByText('125,847')).toHaveLength(2); // Total requests and filtered entries
    expect(screen.getByText('1247ms')).toBeInTheDocument(); // Processing time
  });

  it('disables export button when downloading', () => {
    const mockOnProgressUpdate = vi.mocked(exportService.onProgressUpdate);
    mockOnProgressUpdate.mockImplementation((callback) => {
      // Simulate download in progress
      callback({
        isDownloading: true,
        progress: 50,
        fileName: 'test.csv'
      });
      return vi.fn();
    });

    render(<ExportInterface {...defaultProps} />);
    
    const exportButton = screen.getByText('Exporting...');
    expect(exportButton).toBeDisabled();
  });

  it('shows download progress when downloading', () => {
    const mockOnProgressUpdate = vi.mocked(exportService.onProgressUpdate);
    mockOnProgressUpdate.mockImplementation((callback) => {
      callback({
        isDownloading: true,
        progress: 75,
        fileName: 'alb-analysis.csv'
      });
      return vi.fn();
    });

    render(<ExportInterface {...defaultProps} />);
    
    expect(screen.getByText('Download Progress')).toBeInTheDocument();
    expect(screen.getByText('Downloading alb-analysis.csv...')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('handles export with no analysis result', async () => {
    render(<ExportInterface {...defaultProps} analysisResult={null} />);
    
    // The export button should not be visible when there's no analysis result, but the title should still be there
    expect(screen.getByText('Export Analysis Results')).toBeInTheDocument();
    expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
    expect(screen.getByText('No analysis data available. Please process some log files first.')).toBeInTheDocument();
  });

  it('formats AWS config filename correctly', async () => {
    const mockPreviewConfig = vi.mocked(exportService.previewAWSLoadTestConfig);
    const mockDownloadFile = vi.mocked(exportService.downloadFile);
    
    const configWithSpaces = {
      ...mockAWSLoadTestConfig,
      testName: 'My Test Config With Spaces'
    };
    mockPreviewConfig.mockResolvedValue(configWithSpaces);

    render(<ExportInterface {...defaultProps} />);
    
    const awsRadio = screen.getByDisplayValue('aws-load-test');
    fireEvent.click(awsRadio);
    
    const previewButton = screen.getByText('Preview Configuration');
    fireEvent.click(previewButton);
    
    await waitFor(() => {
      expect(screen.getByText('Configuration Preview')).toBeInTheDocument();
    });
    
    const downloadButton = screen.getByText('Download Config');
    fireEvent.click(downloadButton);
    
    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.any(String),
      'my-test-config-with-spaces.json'
    );
  });
});