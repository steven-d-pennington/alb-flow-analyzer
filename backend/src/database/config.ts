/**
 * Database configuration utilities and helpers
 */

import { DatabaseConfig, DatabaseType } from './types';

export class DatabaseConfigBuilder {
  private config: Partial<DatabaseConfig> = {};

  static create(): DatabaseConfigBuilder {
    return new DatabaseConfigBuilder();
  }

  type(type: DatabaseType): DatabaseConfigBuilder {
    this.config.type = type;
    return this;
  }

  database(database: string): DatabaseConfigBuilder {
    this.config.database = database;
    return this;
  }

  filename(filename: string): DatabaseConfigBuilder {
    this.config.filename = filename;
    return this;
  }

  host(host: string): DatabaseConfigBuilder {
    this.config.host = host;
    return this;
  }

  port(port: number): DatabaseConfigBuilder {
    this.config.port = port;
    return this;
  }

  username(username: string): DatabaseConfigBuilder {
    this.config.username = username;
    return this;
  }

  password(password: string): DatabaseConfigBuilder {
    this.config.password = password;
    return this;
  }

  connectionString(connectionString: string): DatabaseConfigBuilder {
    this.config.connectionString = connectionString;
    return this;
  }

  maxConnections(maxConnections: number): DatabaseConfigBuilder {
    this.config.maxConnections = maxConnections;
    return this;
  }

  ssl(ssl: boolean): DatabaseConfigBuilder {
    this.config.ssl = ssl;
    return this;
  }

  poolConfig(poolConfig: {
    min?: number;
    max?: number;
    acquireTimeoutMillis?: number;
    idleTimeoutMillis?: number;
  }): DatabaseConfigBuilder {
    this.config.pool = poolConfig;
    return this;
  }

  clickhouseConfig(clickhouseConfig: {
    format?: string;
    session_id?: string;
    session_timeout?: number;
  }): DatabaseConfigBuilder {
    this.config.clickhouse = clickhouseConfig;
    return this;
  }

  build(): DatabaseConfig {
    if (!this.config.type) {
      throw new Error('Database type is required');
    }

    return this.config as DatabaseConfig;
  }
}

export class DatabaseConfigValidator {
  static validate(config: DatabaseConfig): string[] {
    const errors: string[] = [];

    if (!config.type) {
      errors.push('Database type is required');
      return errors;
    }

    switch (config.type) {
      case 'sqlite':
        if (!config.database && !config.filename) {
          errors.push('SQLite requires either database or filename');
        }
        break;

      case 'postgresql':
        if (!config.connectionString && (!config.host || !config.database)) {
          errors.push('PostgreSQL requires either connectionString or host/database');
        }
        if (config.port && (config.port < 1 || config.port > 65535)) {
          errors.push('PostgreSQL port must be between 1 and 65535');
        }
        break;

      case 'clickhouse':
        if (!config.connectionString && (!config.host || !config.database)) {
          errors.push('ClickHouse requires either connectionString or host/database');
        }
        if (config.port && (config.port < 1 || config.port > 65535)) {
          errors.push('ClickHouse port must be between 1 and 65535');
        }
        break;

      case 'duckdb':
        if (!config.database && !config.filename) {
          errors.push('DuckDB requires either database or filename');
        }
        break;

      default:
        errors.push(`Unsupported database type: ${config.type}`);
    }

    if (config.maxConnections !== undefined && config.maxConnections < 1) {
      errors.push('maxConnections must be greater than 0');
    }

    if (config.pool) {
      if (config.pool.min && config.pool.min < 0) {
        errors.push('Pool min connections must be >= 0');
      }
      if (config.pool.max && config.pool.max < 1) {
        errors.push('Pool max connections must be >= 1');
      }
      if (config.pool.min && config.pool.max && config.pool.min > config.pool.max) {
        errors.push('Pool min connections cannot be greater than max connections');
      }
    }

    return errors;
  }

  static isValid(config: DatabaseConfig): boolean {
    return this.validate(config).length === 0;
  }
}

export const DatabaseDefaults = {
  sqlite: {
    maxConnections: 10,
    filename: ':memory:'
  },
  postgresql: {
    port: 5432,
    maxConnections: 20,
    pool: {
      min: 0,
      max: 20,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000
    }
  },
  clickhouse: {
    port: 8123,
    maxConnections: 10,
    username: 'default',
    clickhouse: {
      format: 'JSONEachRow'
    }
  },
  duckdb: {
    maxConnections: 5,
    filename: ':memory:'
  }
};

export function createDefaultConfig(type: DatabaseType, overrides: Partial<DatabaseConfig> = {}): DatabaseConfig {
  const defaults = DatabaseDefaults[type];
  
  return {
    type,
    ...defaults,
    ...overrides
  } as DatabaseConfig;
}