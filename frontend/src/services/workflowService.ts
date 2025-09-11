import axios from 'axios';
import { 
  WorkflowAnalysisResult, 
  WorkflowFilterCriteria,
  WorkflowAnalysisOptions,
  Session,
  WorkflowPattern
} from '../types/workflow';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class WorkflowService {
  /**
   * Get comprehensive workflow analysis
   */
  static async getWorkflowAnalysis(filters?: WorkflowFilterCriteria): Promise<WorkflowAnalysisResult> {
    try {
      let url = `${BASE_URL}/api/workflow/analysis`;
      
      // Add filters as query parameters
      if (filters) {
        const queryParams = new URLSearchParams();
        
        if (filters.timeRange) {
          queryParams.append('startTime', filters.timeRange.start.toISOString());
          queryParams.append('endTime', filters.timeRange.end.toISOString());
        }
        
        if (filters.endpoints) {
          filters.endpoints.forEach(endpoint => {
            queryParams.append('endpoints', endpoint);
          });
        }
        
        if (filters.clientIps) {
          filters.clientIps.forEach(ip => {
            queryParams.append('clientIps', ip);
          });
        }

        // Add workflow-specific filtering options
        if (filters.excludeEndpoints) {
          filters.excludeEndpoints.forEach(endpoint => {
            queryParams.append('excludeEndpoints', endpoint);
          });
        }

        if (filters.includeOnlyEndpoints) {
          filters.includeOnlyEndpoints.forEach(endpoint => {
            queryParams.append('includeOnlyEndpoints', endpoint);
          });
        }

        if (filters.excludeUserAgents) {
          filters.excludeUserAgents.forEach(agent => {
            queryParams.append('excludeUserAgents', agent);
          });
        }

        if (filters.minSessionDuration !== undefined) {
          queryParams.append('minSessionDuration', filters.minSessionDuration.toString());
        }
        
        if (queryParams.toString()) {
          url += `?${queryParams.toString()}`;
        }
      }
      
      const response = await axios.get<WorkflowAnalysisResult>(url);
      
      // Convert date strings back to Date objects
      const result = response.data;
      result.timestamp = new Date(result.timestamp);
      
      // Convert session dates
      result.sessions = result.sessions.map(session => ({
        ...session,
        startTime: new Date(session.startTime),
        endTime: new Date(session.endTime),
        requests: session.requests.map(request => ({
          ...request,
          timestamp: new Date(request.timestamp)
        }))
      }));
      
      return result;
    } catch (error) {
      console.error('Error fetching workflow analysis:', error);
      throw error;
    }
  }

  /**
   * Run workflow analysis with filters
   */
  static async getFilteredWorkflowAnalysis(filters: WorkflowFilterCriteria): Promise<WorkflowAnalysisResult> {
    try {
      const response = await axios.post<WorkflowAnalysisResult>(
        `${BASE_URL}/api/workflow/analysis/filtered`,
        filters
      );
      
      // Convert date strings back to Date objects
      const result = response.data;
      result.timestamp = new Date(result.timestamp);
      
      // Convert session dates
      result.sessions = result.sessions.map(session => ({
        ...session,
        startTime: new Date(session.startTime),
        endTime: new Date(session.endTime),
        requests: session.requests.map(request => ({
          ...request,
          timestamp: new Date(request.timestamp)
        }))
      }));
      
      return result;
    } catch (error) {
      console.error('Error fetching filtered workflow analysis:', error);
      throw error;
    }
  }

  /**
   * Get detailed session information
   */
  static async getSessionDetails(sessionId: string): Promise<Session> {
    try {
      const response = await axios.get<Session>(`${BASE_URL}/api/workflow/sessions/${sessionId}`);
      
      const session = response.data;
      return {
        ...session,
        startTime: new Date(session.startTime),
        endTime: new Date(session.endTime),
        requests: session.requests.map(request => ({
          ...request,
          timestamp: new Date(request.timestamp)
        }))
      };
    } catch (error) {
      console.error('Error fetching session details:', error);
      throw error;
    }
  }

  /**
   * Get patterns similar to a specific pattern
   */
  static async getSimilarPatterns(patternId: string): Promise<{
    patternId: string;
    similarPatterns: WorkflowPattern[];
    count: number;
  }> {
    try {
      const response = await axios.get(`${BASE_URL}/api/workflow/patterns/${patternId}/similar`);
      return response.data;
    } catch (error) {
      console.error('Error fetching similar patterns:', error);
      throw error;
    }
  }

  /**
   * Update session reconstruction configuration
   */
  static async updateSessionConfig(config: {
    maxInactivityMinutes?: number;
    minRequestsPerSession?: number;
  }): Promise<{ message: string; config: any }> {
    try {
      const response = await axios.put(`${BASE_URL}/api/workflow/config/session`, config);
      return response.data;
    } catch (error) {
      console.error('Error updating session config:', error);
      throw error;
    }
  }

  /**
   * Update pattern discovery configuration
   */
  static async updatePatternConfig(config: {
    minSupport?: number;
    maxLength?: number;
  }): Promise<{ message: string; config: any }> {
    try {
      const response = await axios.put(`${BASE_URL}/api/workflow/config/pattern`, config);
      return response.data;
    } catch (error) {
      console.error('Error updating pattern config:', error);
      throw error;
    }
  }

  /**
   * Get workflow service status
   */
  static async getServiceStatus(): Promise<{
    service: string;
    status: string;
    capabilities: string[];
    timestamp: string;
  }> {
    try {
      const response = await axios.get(`${BASE_URL}/api/workflow/status`);
      return response.data;
    } catch (error) {
      console.error('Error fetching workflow service status:', error);
      throw error;
    }
  }
}