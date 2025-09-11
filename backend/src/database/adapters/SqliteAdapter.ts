/**
 * SQLite database adapter with connection pooling
 */

import sqlite3 from 'sqlite3';
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

export class SqliteConnection implements DatabaseConnection {
  private db: sqlite3.Database;
  private inTransaction = false;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(new QueryError(`SQLite query failed: ${err.message}`, sql, err));
          return;
        }

        // Get column info from the first row if available
        const fields: FieldInfo[] = [];
        if (rows && rows.length > 0 && rows[0]) {
          Object.keys(rows[0] as Record<string, any>).forEach(key => {
            fields.push({
              name: key,
              type: 'TEXT', // SQLite is dynamically typed
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
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(new QueryError(`SQLite execute failed: ${err.message}`, sql, err));
          return;
        }

        resolve({
          affectedRows: this.changes,
          insertId: this.lastID
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
      this.db.close((err) => {
        if (err) {
          reject(new ConnectionError(`Failed to close SQLite connection: ${err.message}`, err));
          return;
        }
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.db !== null;
  }
}

export class SqliteConnectionPool implements ConnectionPool {
  private config: DatabaseConfig;
  private connections: SqliteConnection[] = [];
  private availableConnections: SqliteConnection[] = [];
  private waitingClients: Array<{
    resolve: (connection: SqliteConnection) => void;
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
    const sqliteConnection = connection as SqliteConnection;
    
    if (!this.connections.includes(sqliteConnection)) {
      throw new Error('Connection does not belong to this pool');
    }

    // Serve waiting client if any
    if (this.waitingClients.length > 0) {
      const client = this.waitingClients.shift()!;
      client.resolve(sqliteConnection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(sqliteConnection);
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
  }

  getStats(): PoolStats {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.connections.length - this.availableConnections.length,
      idleConnections: this.availableConnections.length,
      waitingClients: this.waitingClients.length
    };
  }

  private async createConnection(): Promise<SqliteConnection> {
    return new Promise((resolve, reject) => {
      const filename = this.config.filename || this.config.database || ':memory:';
      const db = new sqlite3.Database(filename, (err) => {
        if (err) {
          reject(new ConnectionError(`Failed to create SQLite connection: ${err.message}`, err));
          return;
        }

        // Enable foreign keys for better data integrity
        // Note: Some pragmas like synchronous cannot be changed inside transactions
        db.serialize(() => {
          db.run('PRAGMA foreign_keys = ON');
          db.run('PRAGMA cache_size = 1000');
          db.run('PRAGMA temp_store = MEMORY');
        });

        resolve(new SqliteConnection(db));
      });
    });
  }
}