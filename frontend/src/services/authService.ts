import axios from 'axios';
import { AWSCredentials, CredentialValidationResult, SessionData } from '../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 seconds for S3 operations that may take longer
});

export class AuthService {
  /**
   * Validate AWS credentials and create a session
   */
  static async validateCredentials(credentials: AWSCredentials): Promise<CredentialValidationResult> {
    try {
      const response = await api.post('/api/auth/credentials', credentials);
      
      return {
        isValid: true,
        sessionToken: response.data.sessionToken,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          isValid: false,
          error: error.response?.data?.message || error.message,
        };
      }
      
      return {
        isValid: false,
        error: 'An unexpected error occurred',
      };
    }
  }

  /**
   * Get current session information
   */
  static async getSession(sessionToken: string): Promise<SessionData | null> {
    try {
      const response = await api.get('/api/auth/session', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Revoke current session
   */
  static async revokeSession(sessionToken: string): Promise<boolean> {
    try {
      await api.delete('/api/auth/session', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      
      return true;
    } catch (error) {
      console.error('Failed to revoke session:', error);
      return false;
    }
  }

  /**
   * Test credentials without creating a session (for validation only)
   */
  static async testCredentials(credentials: AWSCredentials): Promise<boolean> {
    try {
      const response = await api.post('/api/auth/test', credentials);
      return response.data.valid === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get session token for environment credentials (if available on server)
   */
  static async getEnvironmentSession(): Promise<string | null> {
    try {
      const response = await api.post('/api/auth/environment-session');
      return response.data.sessionToken;
    } catch (error) {
      console.log('No environment credentials available on server');
      return null;
    }
  }
}

// Add request interceptor to include session token
api.interceptors.request.use((config) => {
  const sessionToken = localStorage.getItem('aws_session_token');
  if (sessionToken) {
    config.headers.Authorization = `Bearer ${sessionToken}`;
  }
  return config;
});

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid session
      localStorage.removeItem('aws_session_token');
      localStorage.removeItem('aws_credentials');
      
      // Optionally redirect to login or emit event
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    return Promise.reject(error);
  }
);

export { api };