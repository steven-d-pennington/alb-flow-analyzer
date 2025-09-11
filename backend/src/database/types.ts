/**
 * Database configuration types and interfaces
 */

export type DatabaseType = 'sqlite' | 'postgresql' | 'clickhouse' | 'duckdb';

export interface DatabaseConfig {
  type: DatabaseType;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  maxConnections?: number;
  ssl?: boolean;
  // SQLite specific options
  filename?: string;
  // ClickHouse specific options
  clickhouse?: {
    format?: string;
    session_id?: string;
    session_timeout?: number;
  };
  // Connection pool options
  pool?: {
    min?: number;
    max?: number;
    acquireTimeoutMillis?: number;
    idleTimeoutMillis?: number;
  };
}

export interface ConnectionPool {
  acquire(): Promise<DatabaseConnection>;
  release(connection: DatabaseConnection): Promise<void>;
  destroy(): Promise<void>;
  getStats(): PoolStats;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
}

export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  execute(sql: string, params?: any[]): Promise<ExecuteResult>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: FieldInfo[];
}

export interface ExecuteResult {
  affectedRows: number;
  insertId?: number | string;
}

export interface FieldInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(message: string, public query?: string, originalError?: Error) {
    super(message, 'QUERY_ERROR', originalError);
    this.name = 'QueryError';
  }
}