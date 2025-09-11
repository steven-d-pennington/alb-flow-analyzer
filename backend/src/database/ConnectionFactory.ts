/**
 * Database connection factory interface and implementation
 */

import { DatabaseConfig, DatabaseConnection, ConnectionPool, DatabaseType } from './types';
import { SqliteConnectionPool } from './adapters/SqliteAdapter';
import { PostgresConnectionPool } from './adapters/PostgresAdapter';
import { ClickHouseConnectionPool } from './adapters/ClickHouseAdapter';
import { DuckDBConnectionPool } from './adapters/DuckDBAdapter';

export interface IConnectionFactory {
  createPool(config: DatabaseConfig): Promise<ConnectionPool>;
  validateConfig(config: DatabaseConfig): Promise<boolean>;
  getSupportedTypes(): DatabaseType[];
}

export class ConnectionFactory implements IConnectionFactory {
  private static instance: ConnectionFactory;
  private pools: Map<string, ConnectionPool> = new Map();

  private constructor() {}

  public static getInstance(): ConnectionFactory {
    if (!ConnectionFactory.instance) {
      ConnectionFactory.instance = new ConnectionFactory();
    }
    return ConnectionFactory.instance;
  }

  public async createPool(config: DatabaseConfig): Promise<ConnectionPool> {
    const poolKey = this.generatePoolKey(config);
    
    // Return existing pool if available
    if (this.pools.has(poolKey)) {
      return this.pools.get(poolKey)!;
    }

    // Validate configuration before creating pool
    await this.validateConfig(config);

    let pool: ConnectionPool;

    switch (config.type) {
      case 'sqlite':
        pool = new SqliteConnectionPool(config);
        break;
      case 'postgresql':
        pool = new PostgresConnectionPool(config);
        break;
      case 'clickhouse':
        pool = new ClickHouseConnectionPool(config);
        break;
      case 'duckdb':
        pool = new DuckDBConnectionPool(config);
        break;
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }

    this.pools.set(poolKey, pool);
    return pool;
  }

  public async validateConfig(config: DatabaseConfig): Promise<boolean> {
    if (!config.type) {
      throw new Error('Database type is required');
    }

    if (!this.getSupportedTypes().includes(config.type)) {
      throw new Error(`Unsupported database type: ${config.type}`);
    }

    switch (config.type) {
      case 'sqlite':
        if (!config.database && !config.filename) {
          throw new Error('SQLite requires either database or filename');
        }
        break;
      case 'postgresql':
        if (!config.connectionString && (!config.host || !config.database)) {
          throw new Error('PostgreSQL requires either connectionString or host/database');
        }
        break;
      case 'clickhouse':
        if (!config.connectionString && (!config.host || !config.database)) {
          throw new Error('ClickHouse requires either connectionString or host/database');
        }
        break;
      case 'duckdb':
        if (!config.database && !config.filename) {
          throw new Error('DuckDB requires either database or filename');
        }
        break;
    }

    return true;
  }

  public getSupportedTypes(): DatabaseType[] {
    return ['sqlite', 'postgresql', 'clickhouse', 'duckdb'];
  }

  public async closePool(config: DatabaseConfig): Promise<void> {
    const poolKey = this.generatePoolKey(config);
    const pool = this.pools.get(poolKey);
    
    if (pool) {
      await pool.destroy();
      this.pools.delete(poolKey);
    }
  }

  public async closeAllPools(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(pool => pool.destroy());
    await Promise.all(closePromises);
    this.pools.clear();
  }

  private generatePoolKey(config: DatabaseConfig): string {
    const key = `${config.type}:${config.host || 'localhost'}:${config.port || 'default'}:${config.database}`;
    return key;
  }
}

export default ConnectionFactory;