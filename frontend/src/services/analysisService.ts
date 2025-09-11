import axios from 'axios';
import { AnalysisResult, FilterCriteria } from '../types/analysis';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class AnalysisService {
  private static instance: AnalysisService;

  public static getInstance(): AnalysisService {
    if (!AnalysisService.instance) {
      AnalysisService.instance = new AnalysisService();
    }
    return AnalysisService.instance;
  }

  async getAnalysisResults(): Promise<AnalysisResult> {
    try {
      // Use the full analysis endpoint to get comprehensive metrics
      // Use default limit that we know works with the backend
      const response = await axios.get(`${API_BASE_URL}/api/analysis/results?limit=100`);
      
      // Handle the paginated response structure from the backend
      if (!response.data.data || response.data.data.length === 0) {
        // If no analysis data is available, return empty structure
        return {
          metrics: {
            totalRequests: 0,
            requestsPerMinute: [],
            requestsPerHour: [],
            requestsPerDay: [],
            peakPeriods: [],
            responseTimePercentiles: {
              p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0
            },
            responseTimeBreakdown: {
              requestProcessing: { p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 },
              targetProcessing: { p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 },
              responseProcessing: { p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 },
              total: { p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 }
            },
            statusCodeDistribution: [],
            statusCodeTrends: [],
            endpointStats: [],
            userAgentStats: [],
            clientIpStats: [],
            errorPatterns: []
          },
          filteredEntryCount: 0,
          totalEntryCount: 0,
          processingTime: 0,
          lastUpdated: new Date()
        };
      }
      
      // Extract the analysis result from the paginated response
      const analysisData = response.data.data[0];
      
      // Transform dates in time series data
      const transformTimeSeries = (series: any[]) => 
        series.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      
      // Transform peak periods
      const transformPeakPeriods = (periods: any[]) => 
        periods.map((period: any) => ({
          ...period,
          startTime: new Date(period.startTime),
          endTime: new Date(period.endTime)
        }));
      
      // Transform error patterns
      const transformErrorPatterns = (patterns: any[]) => 
        patterns.map((pattern: any) => ({
          ...pattern,
          timeRange: {
            start: new Date(pattern.timeRange.start),
            end: new Date(pattern.timeRange.end)
          }
        }));

      return {
        metrics: {
          totalRequests: analysisData.metrics.totalRequests,
          requestsPerMinute: transformTimeSeries(analysisData.metrics.requestsPerMinute || []),
          requestsPerHour: transformTimeSeries(analysisData.metrics.requestsPerHour || []),
          requestsPerDay: transformTimeSeries(analysisData.metrics.requestsPerDay || []),
          peakPeriods: transformPeakPeriods(analysisData.metrics.peakPeriods || []),
          responseTimePercentiles: analysisData.metrics.responseTimePercentiles,
          responseTimeBreakdown: analysisData.metrics.responseTimeBreakdown,
          statusCodeDistribution: analysisData.metrics.statusCodeDistribution || [],
          statusCodeTrends: analysisData.metrics.statusCodeTrends || [],
          endpointStats: analysisData.metrics.endpointStats || [],
          userAgentStats: analysisData.metrics.userAgentStats || [],
          clientIpStats: analysisData.metrics.clientIpStats || [],
          errorPatterns: transformErrorPatterns(analysisData.metrics.errorPatterns || [])
        },
        filteredEntryCount: analysisData.filteredEntryCount,
        totalEntryCount: analysisData.totalEntryCount,
        processingTime: analysisData.processingTime,
        lastUpdated: new Date(analysisData.lastUpdated)
      };
    } catch (error) {
      console.error('Failed to fetch analysis results:', error);
      throw new Error('Failed to fetch analysis results');
    }
  }

  async getPaginatedData(page: number = 1, limit: number = 100) {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/analysis/raw-data?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch paginated data:', error);
      throw new Error('Failed to fetch paginated data');
    }
  }

  async applyFilters(filters: FilterCriteria): Promise<AnalysisResult> {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/analysis/filter`, filters);
      return {
        ...response.data,
        lastUpdated: new Date(response.data.lastUpdated),
        metrics: {
          ...response.data.metrics,
          requestsPerMinute: response.data.metrics.requestsPerMinute.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          })),
          requestsPerHour: response.data.metrics.requestsPerHour.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          })),
          peakPeriods: response.data.metrics.peakPeriods.map((period: any) => ({
            ...period,
            startTime: new Date(period.startTime),
            endTime: new Date(period.endTime)
          }))
        }
      };
    } catch (error) {
      console.error('Failed to apply filters:', error);
      throw new Error('Failed to apply filters');
    }
  }

  async getProcessingProgress(): Promise<{ isProcessing: boolean; progress: number; currentFile?: string }> {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/files/progress`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch processing progress:', error);
      return { isProcessing: false, progress: 0 };
    }
  }
}

export const analysisService = AnalysisService.getInstance();