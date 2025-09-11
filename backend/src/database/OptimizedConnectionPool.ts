/**
 * Optimized Connection Pool for high-performance database operations
 */

import { ConnectionPool, DatabaseConnection, PoolStats, DatabaseConfig, DatabaseType } from './types';

export interface OptimizedPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeMs?: number;
  testOnBorrow?: boolean;
  validationQuery?: string;
  connectionRetries?: number;
  retryDelayMs?: number;
}

export class OptimizedConnectionPool implements ConnectionPool {
  private connections: DatabaseConnection[] = [];
  private availableConnections: DatabaseConnection[] = [];
  private usedConnections: Set<DatabaseConnection> = new Set();
  private waitingClients: Array<{
    resolve: (connection: DatabaseConnection) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private config: OptimizedPoolConfig;
  private dbConfig: DatabaseConfig;
  private connectionFactory: (config: DatabaseConfig) => Promise<DatabaseConnection>;
  private isDestroyed = false;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    dbConfig: DatabaseConfig,
    connectionFactory: (config: DatabaseConfig) => Promise<DatabaseConnection>,
    config: Partial<OptimizedPoolConfig> = {}
  ) {
    this.dbConfig = dbConfig;
    this.connectionFactory = connectionFactory;
    this.config = {
      minConnections: config.minConnections ?? 2,
      maxConnections: config.maxConnections ?? 20,
      acquireTimeoutMs: config.acquireTimeoutMs ?? 10000,
      idleTimeoutMs: config.idleTimeoutMs ?? 300000, // 5 minutes
      maxLifetimeMs: config.maxLifetimeMs ?? 3600000, // 1 hour
      testOnBorrow: config.testOnBorrow ?? true,
      validationQuery: config.validationQuery ?? 'SELECT 1',
      connectionRetries: config.connectionRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000
    };

    this.initialize();
    this.startCleanupTask();
  }

  /**
   * Initialize the connection pool with minimum connections
   */
  private async initialize(): Promise<void> {
    try {
      console.log(`Initializing connection pool with ${this.config.minConnections} connections...`);
      
      for (let i = 0; i < this.config.minConnections; i++) {
        const connection = await this.createConnection();
        this.connections.push(connection);
        this.availableConnections.push(connection);
      }
      
      console.log('Connection pool initialized successfully');
    } catch (error) {
      console.error('Failed to initialize connection pool:', error);
      throw error;
    }
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<DatabaseConnection> {
    if (this.isDestroyed) {
      throw new Error('Connection pool has been destroyed');
    }

    // Check if there's an available connection
    const availableConnection = this.availableConnections.pop();
    if (availableConnection) {
      // Validate connection if needed
      if (this.config.testOnBorrow && !(await this.validateConnection(availableConnection))) {
        // Connection is invalid, create a new one
        this.removeConnection(availableConnection);
        return this.acquire(); // Retry
      }
      
      this.usedConnections.add(availableConnection);
      return availableConnection;
    }

    // No available connections, try to create a new one
    if (this.connections.length < this.config.maxConnections) {
      try {
        const newConnection = await this.createConnection();
        this.connections.push(newConnection);
        this.usedConnections.add(newConnection);
        return newConnection;
      } catch (error) {
        console.error('Failed to create new connection:', error);
        // Fall through to waiting logic
      }
    }

    // Pool is at capacity, wait for a connection to be released
    return new Promise<DatabaseConnection>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingClients.findIndex(client => client.resolve === resolve);
        if (index !== -1) {
          this.waitingClients.splice(index, 1);
        }
        reject(new Error(`Connection acquire timeout after ${this.config.acquireTimeoutMs}ms`));
      }, this.config.acquireTimeoutMs);

      this.waitingClients.push({
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now()
      });
    });
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: DatabaseConnection): Promise<void> {
    if (!this.usedConnections.has(connection)) {
      console.warn('Attempted to release connection that was not acquired from this pool');
      return;
    }

    this.usedConnections.delete(connection);

    // Check if there are waiting clients
    const waitingClient = this.waitingClients.shift();
    if (waitingClient) {
      // Validate connection before giving to waiting client
      if (this.config.testOnBorrow && !(await this.validateConnection(connection))) {
        this.removeConnection(connection);
        // Try to create a new connection for the waiting client
        try {
          const newConnection = await this.createConnection();
          this.connections.push(newConnection);
          this.usedConnections.add(newConnection);
          waitingClient.resolve(newConnection);
        } catch (error) {
          waitingClient.reject(error);
        }
      } else {
        this.usedConnections.add(connection);
        waitingClient.resolve(connection);
      }
      return;
    }

    // No waiting clients, return connection to available pool
    this.availableConnections.push(connection);
  }

  /**
   * Destroy the connection pool and close all connections
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Reject all waiting clients
    for (const client of this.waitingClients) {
      client.reject(new Error('Connection pool is being destroyed'));
    }
    this.waitingClients.length = 0;

    // Close all connections
    const allConnections = [...this.connections];
    for (const connection of allConnections) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection during pool destruction:', error);
      }
    }

    this.connections.length = 0;
    this.availableConnections.length = 0;
    this.usedConnections.clear();
    
    console.log('Connection pool destroyed');
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.usedConnections.size,
      idleConnections: this.availableConnections.length,
      waitingClients: this.waitingClients.length
    };
  }

  /**
   * Create a new database connection with retry logic
   */
  private async createConnection(): Promise<DatabaseConnection> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.connectionRetries!; attempt++) {
      try {
        const connection = await this.connectionFactory(this.dbConfig);
        
        // Set connection-specific optimizations based on database type
        await this.optimizeConnection(connection);
        
        return connection;
      } catch (error) {
        lastError = error as Error;
        console.error(`Connection attempt ${attempt} failed:`, error);
        
        if (attempt < this.config.connectionRetries!) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs! * attempt));
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Apply database-specific optimizations to new connections
   */
  private async optimizeConnection(connection: DatabaseConnection): Promise<void> {
    try {
      switch (this.dbConfig.type) {
        case 'sqlite':
          // SQLite optimizations
          await connection.execute('PRAGMA journal_mode = WAL');
          await connection.execute('PRAGMA synchronous = NORMAL');
          await connection.execute('PRAGMA cache_size = 10000');
          await connection.execute('PRAGMA temp_store = memory');
          await connection.execute('PRAGMA mmap_size = 268435456'); // 256MB
          break;
          
        case 'postgresql':
          // PostgreSQL optimizations
          await connection.execute('SET enable_seqscan = off');
          await connection.execute('SET random_page_cost = 1.1');
          await connection.execute('SET effective_cache_size = "256MB"');
          break;
          
        case 'clickhouse':
          // ClickHouse optimizations
          await connection.execute('SET max_memory_usage = 1000000000'); // 1GB
          await connection.execute('SET max_threads = 4');
          break;
      }
    } catch (error) {
      console.warn('Failed to apply connection optimizations:', error);
      // Don't throw, as the connection might still be usable
    }
  }

  /**
   * Validate a connection to ensure it's still alive
   */
  private async validateConnection(connection: DatabaseConnection): Promise<boolean> {
    try {
      if (!connection.isConnected()) {
        return false;
      }
      
      await connection.query(this.config.validationQuery!);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove a connection from the pool
   */
  private removeConnection(connection: DatabaseConnection): void {
    const index = this.connections.indexOf(connection);
    if (index !== -1) {
      this.connections.splice(index, 1);
    }

    const availableIndex = this.availableConnections.indexOf(connection);
    if (availableIndex !== -1) {
      this.availableConnections.splice(availableIndex, 1);
    }

    this.usedConnections.delete(connection);

    // Close the connection
    connection.close().catch(error => {
      console.error('Error closing removed connection:', error);
    });
  }

  /**
   * Start background cleanup task to remove idle/expired connections
   */
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup().catch(error => {
        console.error('Error during connection pool cleanup:', error);
      });
    }, 60000); // Run cleanup every minute
  }

  /**
   * Perform cleanup of idle and expired connections
   */
  private async performCleanup(): Promise<void> {
    if (this.isDestroyed) return;

    const now = Date.now();
    const connectionsToRemove: DatabaseConnection[] = [];

    // Check available connections for idle timeout
    for (const connection of this.availableConnections) {
      // Note: We'd need to track connection timestamps for proper idle detection
      // This is a simplified version
      if (!(await this.validateConnection(connection))) {
        connectionsToRemove.push(connection);
      }
    }

    // Remove invalid connections
    for (const connection of connectionsToRemove) {
      this.removeConnection(connection);
    }

    // Ensure we maintain minimum connections
    const deficit = this.config.minConnections - this.connections.length;
    if (deficit > 0) {
      try {
        for (let i = 0; i < deficit; i++) {
          const connection = await this.createConnection();
          this.connections.push(connection);
          this.availableConnections.push(connection);
        }
      } catch (error) {
        console.error('Failed to maintain minimum connections during cleanup:', error);
      }
    }
  }
}