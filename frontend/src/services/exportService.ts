import axios from 'axios';
import { AnalysisResult } from '../types/analysis';
import { AWSLoadTestConfig, ExportOptions, DownloadProgress } from '../types/export';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class ExportService {
  private static instance: ExportService;
  private downloadProgress: DownloadProgress = {
    isDownloading: false,
    progress: 0
  };
  private progressCallbacks: ((progress: DownloadProgress) => void)[] = [];

  public static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  onProgressUpdate(callback: (progress: DownloadProgress) => void): () => void {
    this.progressCallbacks.push(callback);
    return () => {
      const index = this.progressCallbacks.indexOf(callback);
      if (index > -1) {
        this.progressCallbacks.splice(index, 1);
      }
    };
  }

  private updateProgress(progress: Partial<DownloadProgress>) {
    this.downloadProgress = { ...this.downloadProgress, ...progress };
    this.progressCallbacks.forEach(callback => callback(this.downloadProgress));
  }

  async exportData(format: string, options: ExportOptions): Promise<string> {
    try {
      const fileExtension = format === 'aws-load-test' ? 'jmx' : format;
      this.updateProgress({
        isDownloading: true,
        progress: 0,
        fileName: `alb-analysis.${fileExtension}`,
        error: undefined
      });

      const response = await axios.get(
        `${API_BASE_URL}/api/export/${format}`,
        {
          params: options,
          responseType: 'blob',
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              this.updateProgress({ progress });
            }
          }
        }
      );

      // Create blob URL for download
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'application/octet-stream' 
      });
      const url = window.URL.createObjectURL(blob);

      this.updateProgress({
        isDownloading: false,
        progress: 100
      });

      return url;
    } catch (error) {
      console.error('Export failed:', error);
      this.updateProgress({
        isDownloading: false,
        progress: 0,
        error: 'Export failed. Please try again.'
      });
      throw new Error('Export failed');
    }
  }

  async generateAWSLoadTestConfig(analysisResult: AnalysisResult): Promise<AWSLoadTestConfig> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/export/aws-load-test-config`,
        { analysisResult }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to generate AWS Load Test config:', error);
      throw new Error('Failed to generate AWS Load Test configuration');
    }
  }

  async previewAWSLoadTestConfig(analysisResult: AnalysisResult): Promise<AWSLoadTestConfig> {
    // Generate a preview config based on analysis results
    const { metrics } = analysisResult;
    
    // Extract top endpoints for test scenarios
    const topEndpoints = metrics.endpointStats
      .slice(0, 5) // Top 5 endpoints
      .filter(endpoint => endpoint.errorRate < 10); // Filter out high error rate endpoints

    const scenarios: any[] = topEndpoints.map((endpoint, index) => ({
      name: `Scenario_${index + 1}_${endpoint.endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
      weight: Math.round(endpoint.percentage),
      requests: [{
        method: 'GET', // Default to GET, could be enhanced based on log data
        url: endpoint.endpoint,
        headers: {
          'User-Agent': 'AWS-Load-Test/1.0',
          'Accept': 'application/json, text/html, */*'
        },
        weight: 100
      }],
      thinkTime: Math.max(1, Math.round(endpoint.averageResponseTime / 100)) // Convert to seconds
    }));

    // Calculate test parameters based on traffic patterns
    const peakRpm = Math.max(...metrics.requestsPerMinute.map(rpm => rpm.value));
    const avgRpm = metrics.requestsPerMinute.reduce((sum, rpm) => sum + rpm.value, 0) / metrics.requestsPerMinute.length;
    
    const config: AWSLoadTestConfig = {
      testName: `ALB_Load_Test_${new Date().toISOString().split('T')[0]}`,
      testDescription: `Generated from ALB flow log analysis. Peak RPM: ${peakRpm}, Average RPM: ${Math.round(avgRpm)}`,
      taskCount: Math.min(50, Math.max(1, Math.round(peakRpm / 100))), // Scale based on peak traffic
      concurrency: Math.min(20, Math.max(1, Math.round(avgRpm / 50))), // Scale based on average traffic
      rampUpTime: 300, // 5 minutes ramp up
      holdForTime: 1800, // 30 minutes hold
      rampDownTime: 300, // 5 minutes ramp down
      scenarios,
      regions: ['us-east-1'] // Default region, could be configurable
    };

    return config;
  }

  downloadFile(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the blob URL
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  getDownloadProgress(): DownloadProgress {
    return this.downloadProgress;
  }
}

export const exportService = ExportService.getInstance();