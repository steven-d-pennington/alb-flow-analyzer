/**
 * PostgreSQL database adapter with connection pooling
 */

import { Pool, Client, PoolClient, QueryResult as PgQueryResult } from 'pg';
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

export class PostgresConnection implements DatabaseConnection {
  private client: PoolClient;
  private inTransaction = false;

  constructor(client: PoolClient) {
    this.client = client;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    try {
      const result = await this.client.query(sql, params);
      
      const fields: FieldInfo[] = result.fields?.map(field => ({
        name: field.name,
        type: this.mapPostgresType(field.dataTypeID),
        nullable: true // PostgreSQL doesn't provide this info easily
      })) || [];

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
        fields
      };
    } catch (error) {
      throw new QueryError(`PostgreSQL query failed: ${(error as Error).message}`, sql, error as Error);
    }
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    try {
      const result = await this.client.query(sql, params);
      return {
        affectedRows: result.rowCount || 0,
        insertId: result.rows[0]?.id // PostgreSQL doesn't have auto-increment IDs like MySQL
      };
    } catch (error) {
      throw new QueryError(`PostgreSQL execute failed: ${(error as Error).message}`, sql, error as Error);
    }
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }
    
    await this.client.query('BEGIN');
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }
    
    await this.client.query('COMMIT');
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }
    
    await this.client.query('ROLLBACK');
    this.inTransaction = false;
  }

  async close(): Promise<void> {
    // For pooled connections, we don't actually close the client
    // The pool will handle connection lifecycle
    this.client.release();
  }

  isConnected(): boolean {
    // PoolClient doesn't have an 'ended' property like regular Client
    // We'll assume it's connected if the client exists
    return this.client !== null && this.client !== undefined;
  }

  private mapPostgresType(dataTypeID: number): string {
    // Map common PostgreSQL type OIDs to readable names
    const typeMap: { [key: number]: string } = {
      16: 'BOOLEAN',
      20: 'BIGINT',
      21: 'SMALLINT',
      23: 'INTEGER',
      25: 'TEXT',
      700: 'REAL',
      701: 'DOUBLE PRECISION',
      1043: 'VARCHAR',
      1082: 'DATE',
      1114: 'TIMESTAMP',
      1184: 'TIMESTAMPTZ'
    };
    
    return typeMap[dataTypeID] || 'UNKNOWN';
  }
}

export class PostgresConnectionPool implements ConnectionPool {
  private config: DatabaseConfig;
  private pool: Pool;
  private destroyed = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
    
    const poolConfig = {
      connectionString: config.connectionString,
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || config.pool?.max || 20,
      min: config.pool?.min || 0,
      acquireTimeoutMillis: config.pool?.acquireTimeoutMillis || 30000,
      idleTimeoutMillis: config.pool?.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      query_timeout: 30000
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });
  }

  async acquire(): Promise<DatabaseConnection> {
    if (this.destroyed) {
      throw new ConnectionError('Connection pool has been destroyed');
    }

    try {
      const client = await this.pool.connect();
      return new PostgresConnection(client);
    } catch (error) {
      throw new ConnectionError(`Failed to acquire PostgreSQL connection: ${(error as Error).message}`, error as Error);
    }
  }

  async release(connection: DatabaseConnection): Promise<void> {
    // PostgreSQL pooled connections are released when close() is called
    await connection.close();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    await this.pool.end();
  }

  getStats(): PoolStats {
    return {
      totalConnections: this.pool.totalCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount
    };
  }
}