import { useState, useEffect, useCallback } from 'react';
import { AuthService } from '../services/authService';
import { AWSCredentials, AuthState } from '../types/auth';

const STORAGE_KEYS = {
  SESSION_TOKEN: 'aws_session_token',
  CREDENTIALS: 'aws_credentials',
} as const;

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    credentials: null,
    sessionToken: null,
    loading: true,
    error: null,
  });

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const sessionToken = localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
        const credentialsStr = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);

        if (sessionToken && credentialsStr) {
          const credentials = JSON.parse(credentialsStr) as AWSCredentials;
          
          // Verify session is still valid
          const sessionData = await AuthService.getSession(sessionToken);
          
          if (sessionData) {
            setAuthState({
              isAuthenticated: true,
              credentials,
              sessionToken,
              loading: false,
              error: null,
            });
          } else {
            // Session expired, clear storage
            clearAuth();
          }
        } else {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        clearAuth();
      }
    };

    initializeAuth();
  }, []);

  // Listen for session expiration events
  useEffect(() => {
    const handleSessionExpired = () => {
      clearAuth();
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
    
    setAuthState({
      isAuthenticated: false,
      credentials: null,
      sessionToken: null,
      loading: false,
      error: null,
    });
  }, []);

  const login = useCallback(async (credentials: AWSCredentials): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await AuthService.validateCredentials(credentials);
      
      if (result.isValid && result.sessionToken) {
        // Store credentials and session token
        localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, result.sessionToken);
        localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(credentials));
        
        setAuthState({
          isAuthenticated: true,
          credentials,
          sessionToken: result.sessionToken,
          loading: false,
          error: null,
        });
        
        return true;
      } else {
        setAuthState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Invalid credentials',
        }));
        
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setAuthState(prev => ({ ...prev, loading: true }));

    try {
      if (authState.sessionToken) {
        await AuthService.revokeSession(authState.sessionToken);
      }
    } catch (error) {
      console.error('Failed to revoke session:', error);
    } finally {
      clearAuth();
    }
  }, [authState.sessionToken, clearAuth]);

  const testCredentials = useCallback(async (credentials: AWSCredentials): Promise<boolean> => {
    try {
      return await AuthService.testCredentials(credentials);
    } catch (error) {
      console.error('Failed to test credentials:', error);
      return false;
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...authState,
    login,
    logout,
    testCredentials,
    clearError,
  };
};