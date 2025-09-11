import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProgressUpdate {
  type: 'progress' | 'status' | 'error' | 'complete';
  operation: string;
  progress?: number; // 0-100
  message?: string;
  data?: any;
  timestamp: string;
}

export interface WebSocketState {
  isConnected: boolean;
  lastMessage: ProgressUpdate | null;
  connectionError: string | null;
  progressUpdates: ProgressUpdate[];
}

export function useWebSocket(url?: string) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
    connectionError: null,
    progressUpdates: []
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const wsUrl = url || `ws://localhost:3001/ws`;

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts.current = 0;
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionError: null
        }));
      };

      ws.onmessage = (event) => {
        try {
          const update: ProgressUpdate = JSON.parse(event.data);
          setState(prev => ({
            ...prev,
            lastMessage: update,
            progressUpdates: [...prev.progressUpdates.slice(-49), update] // Keep last 50 updates
          }));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setState(prev => ({
          ...prev,
          isConnected: false
        }));

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          connectionError: 'WebSocket connection error'
        }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        connectionError: 'Failed to create WebSocket connection'
      }));
    }
  }, [wsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      connectionError: null
    }));
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  const clearProgressUpdates = useCallback(() => {
    setState(prev => ({
      ...prev,
      progressUpdates: [],
      lastMessage: null
    }));
  }, []);

  const getProgressForOperation = useCallback((operation: string): ProgressUpdate[] => {
    return state.progressUpdates.filter(update => update.operation === operation);
  }, [state.progressUpdates]);

  const getLatestProgressForOperation = useCallback((operation: string): ProgressUpdate | null => {
    const updates = getProgressForOperation(operation);
    return updates.length > 0 ? updates[updates.length - 1] : null;
  }, [getProgressForOperation]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    clearProgressUpdates,
    getProgressForOperation,
    getLatestProgressForOperation
  };
}