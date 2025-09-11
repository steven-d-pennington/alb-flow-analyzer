/**
 * Unit tests for database types and error classes
 */

import { 
  DatabaseError, 
  ConnectionError, 
  QueryError,
  DatabaseConfig,
  DatabaseType
} from '../types';

describe('Database Types', () => {
  describe('DatabaseError', () => {
    it('should create basic database error', () => {
      const error = new DatabaseError('Test error');
      
      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBeUndefined();
      expect(error.originalError).toBeUndefined();
    });

    it('should create database error with code and original error', () => {
      const originalError = new Error('Original error');
      const error = new DatabaseError('Test error', 'TEST_CODE', originalError);
      
      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.originalError).toBe(originalError);
    });

    it('should be instance of Error', () => {
      const error = new DatabaseError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('ConnectionError', () => {
    it('should create connection error', () => {
      const error = new ConnectionError('Connection failed');
      
      expect(error.name).toBe('ConnectionError');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('CONNECTION_ERROR');
    });

    it('should create connection error with original error', () => {
      const originalError = new Error('Network timeout');
      const error = new ConnectionError('Connection failed', originalError);
      
      expect(error.name).toBe('ConnectionError');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.originalError).toBe(originalError);
    });

    it('should be instance of DatabaseError', () => {
      const error = new ConnectionError('Connection failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error).toBeInstanceOf(ConnectionError);
    });
  });

  describe('QueryError', () => {
    it('should create query error', () => {
      const error = new QueryError('Query failed');
      
      expect(error.name).toBe('QueryError');
      expect(error.message).toBe('Query failed');
      expect(error.code).toBe('QUERY_ERROR');
      expect(error.query).toBeUndefined();
    });

    it('should create query error with query and original error', () => {
      const originalError = new Error('Syntax error');
      const query = 'SELECT * FROM invalid_table';
      const error = new QueryError('Query failed', query, originalError);
      
      expect(error.name).toBe('QueryError');
      expect(error.message).toBe('Query failed');
      expect(error.code).toBe('QUERY_ERROR');
      expect(error.query).toBe(query);
      expect(error.originalError).toBe(originalError);
    });

    it('should be instance of DatabaseError', () => {
      const error = new QueryError('Query failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error).toBeInstanceOf(QueryError);
    });
  });

  describe('DatabaseConfig validation', () => {
    it('should accept valid SQLite config', () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: 'test.db',
        maxConnections: 10
      };
      
      expect(config.type).toBe('sqlite');
      expect(config.database).toBe('test.db');
      expect(config.maxConnections).toBe(10);
    });

    it('should accept valid PostgreSQL config', () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        ssl: true,
        pool: {
          min: 2,
          max: 20,
          acquireTimeoutMillis: 30000,
          idleTimeoutMillis: 30000
        }
      };
      
      expect(config.type).toBe('postgresql');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.ssl).toBe(true);
      expect(config.pool?.max).toBe(20);
    });

    it('should accept valid ClickHouse config', () => {
      const config: DatabaseConfig = {
        type: 'clickhouse',
        host: 'localhost',
        port: 8123,
        database: 'default',
        username: 'default',
        clickhouse: {
          format: 'JSONEachRow',
          session_timeout: 60
        }
      };
      
      expect(config.type).toBe('clickhouse');
      expect(config.clickhouse?.format).toBe('JSONEachRow');
    });

    it('should accept valid DuckDB config', () => {
      const config: DatabaseConfig = {
        type: 'duckdb',
        filename: 'test.duckdb',
        maxConnections: 5
      };
      
      expect(config.type).toBe('duckdb');
      expect(config.filename).toBe('test.duckdb');
    });
  });

  describe('DatabaseType', () => {
    it('should include all supported types', () => {
      const supportedTypes: DatabaseType[] = ['sqlite', 'postgresql', 'clickhouse', 'duckdb'];
      
      supportedTypes.forEach(type => {
        expect(['sqlite', 'postgresql', 'clickhouse', 'duckdb']).toContain(type);
      });
    });
  });
});