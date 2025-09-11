/**
 * ClickHouse database adapter with connection pooling
 */

import { ClickHouseClient, createClient } from '@clickhouse/client';
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

export class ClickHouseConnection implements DatabaseConnection {
  private client: ClickHouseClient;
  private inTransaction = false;

  constructor(client: ClickHouseClient) {
    this.client = client;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    try {
      // ClickHouse doesn't support traditional parameterized queries
      // We need to format the query manually (be careful with SQL injection)
      const formattedSql = this.formatQuery(sql, params);
      
      const result = await this.client.query({
        query: formattedSql,
        format: 'JSONEachRow'
      });

      const rows = await result.json<T>();
      
      // ClickHouse doesn't provide field metadata in the same way
      // We'll extract field names from the first row
      const fields: FieldInfo[] = [];
      if (Array.isArray(rows) && rows.length > 0) {
        Object.keys(rows[0] as any).forEach(key => {
          fields.push({
            name: key,
            type: 'UNKNOWN', // ClickHouse type detection would require additional queries
            nullable: true
          });
        });
      }

      return {
        rows: Array.isArray(rows) ? rows : [rows],
        rowCount: Array.isArray(rows) ? rows.length : 1,
        fields
      };
    } catch (error) {
      throw new QueryError(`ClickHouse query failed: ${(error as Error).message}`, sql, error as Error);
    }
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    try {
      const formattedSql = this.formatQuery(sql, params);
      
      const result = await this.client.command({
        query: formattedSql
      });

      // ClickHouse doesn't return affected rows count directly
      // For INSERT statements, we might need to parse the response
      return {
        affectedRows: 0, // ClickHouse doesn't provide this easily
        insertId: undefined
      };
    } catch (error) {
      throw new QueryError(`ClickHouse execute failed: ${(error as Error).message}`, sql, error as Error);
    }
  }

  async beginTransaction(): Promise<void> {
    // ClickHouse doesn't support traditional transactions
    // We'll track transaction state but not actually begin one
    if (this.inTransaction) {
      throw new Error('Transaction already in progress');
    }
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }
    // ClickHouse auto-commits, so we just reset the flag
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress');
    }
    // ClickHouse doesn't support rollback, so we just reset the flag
    this.inTransaction = false;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  isConnected(): boolean {
    // ClickHouse client doesn't have a direct connection status check
    return true;
  }

  private formatQuery(sql: string, params: any[]): string {
    if (!params || params.length === 0) {
      return sql;
    }

    // Simple parameter substitution (this is a basic implementation)
    // In production, you'd want more sophisticated parameter handling
    let formattedSql = sql;
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      let value: string;
      
      if (typeof param === 'string') {
        value = `'${param.replace(/'/g, "''")}'`; // Escape single quotes
      } else if (param === null || param === undefined) {
        value = 'NULL';
      } else if (param instanceof Date) {
        value = `'${param.toISOString()}'`;
      } else {
        value = String(param);
      }
      
      formattedSql = formattedSql.replace(placeholder, value);
    });

    return formattedSql;
  }
}

export class ClickHouseConnectionPool implements ConnectionPool {
  private config: DatabaseConfig;
  private connections: ClickHouseConnection[] = [];
  private availableConnections: ClickHouseConnection[] = [];
  private waitingClients: Array<{
    resolve: (connection: ClickHouseConnection) => void;
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
    const clickhouseConnection = connection as ClickHouseConnection;
    
    if (!this.connections.includes(clickhouseConnection)) {
      throw new Error('Connection does not belong to this pool');
    }

    // Serve waiting client if any
    if (this.waitingClients.length > 0) {
      const client = this.waitingClients.shift()!;
      client.resolve(clickhouseConnection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(clickhouseConnection);
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

  private async createConnection(): Promise<ClickHouseConnection> {
    try {
      const clientConfig: any = {
        host: this.config.host || 'localhost',
        port: this.config.port || 8123,
        database: this.config.database,
        username: this.config.username || 'default',
        password: this.config.password,
        clickhouse_settings: this.config.clickhouse || {}
      };

      if (this.config.connectionString) {
        clientConfig.url = this.config.connectionString;
      }

      const client = createClient(clientConfig);
      return new ClickHouseConnection(client);
    } catch (error) {
      throw new ConnectionError(`Failed to create ClickHouse connection: ${(error as Error).message}`, error as Error);
    }
  }
}