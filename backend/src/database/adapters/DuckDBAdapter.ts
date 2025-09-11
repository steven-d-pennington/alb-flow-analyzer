/**
 * DuckDB database adapter with connection pooling
 */

import * as duckdb from 'duckdb';
import { 
  DatabaseConfig, 
  DatabaseConnection, 
  ConnectionPool, 
  QueryResult, 
  ExecuteResult, 
  PoolStats,
  ConnectionError,
  QueryError,
  FieldInfo
} from '../types';

export class DuckDBConnection implements DatabaseConnection {
  private db: duckdb.Database;
  private connection: duckdb.Connection;
  private inTransaction = false;

  constructor(db: duckdb.Database, connection: duckdb.Connection) {
    this.db = db;
    this.connection = connection;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, ...params, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(new QueryError(`DuckDB query failed: ${err.message}`, sql, err));
          return;
        }

        // Extract field information from the first row
        const fields: FieldInfo[] = [];
        if (rows && rows.length > 0) {
          Object.keys(rows[0]).forEach(key => {
            fields.push({
              name: key,
              type: this.inferType(rows[0][key]),
              nullable: true
            });
          });
        }

        resolve({
          rows: rows as T[],
          rowCount: rows ? rows.length : 0,
          fields
        });
      });
    });
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    return new Promise((resolve, reject) => {
      this.connection.run(sql, ...params, function(err: Error | null) {
        if (err) {
          reject(new QueryError(`DuckDB execute failed: ${err.message}`, sql, err));
          return;
        }

        // DuckDB doesn't provide affected rows or insert ID in the same way
        // We'll need to implement this differently or use additional queries
        resolve({
          affectedRows: 0, // DuckDB doesn't provide this directly
          insertId: undefined
        });
      });
    });
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }
    
    await this.execute('BEGIN TRANSACTION');
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }
    
    await this.execute('COMMIT');
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }
    
    await this.execute('ROLLBACK');
    this.inTransaction = false;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.close((err: Error | null) => {
        if (err) {
          reject(new ConnectionError(`Failed to close DuckDB connection: ${err.message}`, err));
          return;
        }
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  private inferType(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'INTEGER' : 'DOUBLE';
    }
    if (typeof value === 'string') return 'VARCHAR';
    if (value instanceof Date) return 'TIMESTAMP';
    return 'UNKNOWN';
  }
}

export class DuckDBConnectionPool implements ConnectionPool {
  private config: DatabaseConfig;
  private db: duckdb.Database | null = null;
  private connections: DuckDBConnection[] = [];
  private availableConnections: DuckDBConnection[] = [];
  private waitingClients: Array<{
    resolve: (connection: DuckDBConnection) => void;
    reject: (error: Error) => void;
  }> = [];
  private maxConnections: number;
  private destroyed = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.maxConnections = config.maxConnections || config.pool?.max || 10;
  }

  async acquire(): Promise<DatabaseConnection> {
    if (this.destroyed) {
      throw new ConnectionError('Connection pool has been destroyed');
    }

    // Initialize database if not done yet
    if (!this.db) {
      await this.initializeDatabase();
    }

    // Return available connection if exists
    if (this.availableConnections.length > 0) {
      return this.availableConnections.pop()!;
    }

    // Create new connection if under limit
    if (this.connections.length < this.maxConnections) {
      const connection = await this.createConnection();
      this.connections.push(connection);
      return connection;
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      this.waitingClients.push({ resolve, reject });
    });
  }

  async release(connection: DatabaseConnection): Promise<void> {
    const duckdbConnection = connection as DuckDBConnection;
    
    if (!this.connections.includes(duckdbConnection)) {
      throw new Error('Connection does not belong to this pool');
    }

    // Serve waiting client if any
    if (this.waitingClients.length > 0) {
      const client = this.waitingClients.shift()!;
      client.resolve(duckdbConnection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(duckdbConnection);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;

    // Reject all waiting clients
    this.waitingClients.forEach(client => {
      client.reject(new ConnectionError('Connection pool destroyed'));
    });
    this.waitingClients = [];

    // Close all connections
    const closePromises = this.connections.map(conn => conn.close());
    await Promise.all(closePromises);

    this.connections = [];
    this.availableConnections = [];

    // Close database
    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        this.db!.close((err: Error | null) => {
          if (err) {
            reject(new ConnectionError(`Failed to close DuckDB database: ${err.message}`, err));
            return;
          }
          resolve();
        });
      });
      this.db = null;
    }
  }

  getStats(): PoolStats {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.connections.length - this.availableConnections.length,
      idleConnections: this.availableConnections.length,
      waitingClients: this.waitingClients.length
    };
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const filename = this.config.filename || this.config.database || ':memory:';
      
      this.db = new duckdb.Database(filename, (err: Error | null) => {
        if (err) {
          reject(new ConnectionError(`Failed to initialize DuckDB database: ${err.message}`, err));
          return;
        }
        resolve();
      });
    });
  }

  private async createConnection(): Promise<DuckDBConnection> {
    if (!this.db) {
      throw new ConnectionError('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        const connection = this.db!.connect();
        resolve(new DuckDBConnection(this.db!, connection));
      } catch (err) {
        reject(new ConnectionError(`Failed to create DuckDB connection: ${(err as Error).message}`, err as Error));
      }
    });
  }
}