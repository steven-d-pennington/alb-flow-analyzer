/**
 * WebSocket server for real-time progress updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface ProgressUpdate {
  type: 'progress' | 'status' | 'error' | 'complete';
  operation: string;
  progress?: number; // 0-100
  message?: string;
  data?: any;
  timestamp: string;
}

export class ALBWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      console.log(`WebSocket client connected: ${clientId}`);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'status',
        operation: 'connection',
        message: 'Connected to ALB Flow Analyzer',
        timestamp: new Date().toISOString()
      });

      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(clientId, data);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleClientMessage(clientId: string, message: any) {
    console.log(`Message from ${clientId}:`, message);
    
    // Handle client messages (e.g., subscribe to specific operations)
    if (message.type === 'subscribe' && message.operation) {
      // Store subscription preferences if needed
      this.sendToClient(clientId, {
        type: 'status',
        operation: message.operation,
        message: `Subscribed to ${message.operation} updates`,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send progress update to a specific client
   */
  sendToClient(clientId: string, update: ProgressUpdate): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(update));
      } catch (error) {
        console.error(`Failed to send message to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Broadcast progress update to all connected clients
   */
  broadcast(update: ProgressUpdate): void {
    const message = JSON.stringify(update);
    
    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error(`Failed to broadcast to client ${clientId}:`, error);
          this.clients.delete(clientId);
        }
      } else {
        // Clean up closed connections
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * Send file processing progress update
   */
  sendFileProcessingProgress(progress: number, message: string, data?: any): void {
    this.broadcast({
      type: 'progress',
      operation: 'file-processing',
      progress: Math.round(progress),
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send analysis progress update
   */
  sendAnalysisProgress(progress: number, message: string, data?: any): void {
    this.broadcast({
      type: 'progress',
      operation: 'analysis',
      progress: Math.round(progress),
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast progress update (generic method for downloads/processing)
   */
  broadcastProgress(update: any): void {
    const progressUpdate: ProgressUpdate = {
      type: update.type || 'progress',
      operation: update.status || update.type || 'unknown',
      progress: update.progress,
      message: update.message,
      data: update.data,
      timestamp: new Date().toISOString()
    };
    this.broadcast(progressUpdate);
  }

  /**
   * Send S3 operation progress update
   */
  sendS3Progress(progress: number, message: string, data?: any): void {
    this.broadcast({
      type: 'progress',
      operation: 's3-operation',
      progress: Math.round(progress),
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send error notification
   */
  sendError(operation: string, message: string, error?: any): void {
    this.broadcast({
      type: 'error',
      operation,
      message,
      data: error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send completion notification
   */
  sendComplete(operation: string, message: string, data?: any): void {
    this.broadcast({
      type: 'complete',
      operation,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections and shutdown server
   */
  close(): void {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });
    this.clients.clear();
    this.wss.close();
  }
}