/**
 * Unit tests for database configuration utilities
 */

import { 
  DatabaseConfigBuilder, 
  DatabaseConfigValidator, 
  DatabaseDefaults,
  createDefaultConfig
} from '../config';
import { DatabaseConfig } from '../types';

describe('Database Configuration Utilities', () => {
  describe('DatabaseConfigBuilder', () => {
    it('should build SQLite config', () => {
      const config = DatabaseConfigBuilder.create()
        .type('sqlite')
        .database('test.db')
        .maxConnections(5)
        .build();

      expect(config).toEqual({
        type: 'sqlite',
        database: 'test.db',
        maxConnections: 5
      });
    });

    it('should build PostgreSQL config', () => {
      const config = DatabaseConfigBuilder.create()
        .type('postgresql')
        .host('localhost')
        .port(5432)
        .database('testdb')
        .username('user')
        .password('pass')
        .ssl(true)
        .poolConfig({
          min: 2,
          max: 10,
          acquireTimeoutMillis: 30000
        })
        .build();

      expect(config).toEqual({
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'user',
        password: 'pass',
        ssl: true,
        pool: {
          min: 2,
          max: 10,
          acquireTimeoutMillis: 30000
        }
      });
    });

    it('should build ClickHouse config', () => {
      const config = DatabaseConfigBuilder.create()
        .type('clickhouse')
        .host('localhost')
        .port(8123)
        .database('default')
        .username('default')
        .clickhouseConfig({
          format: 'JSONEachRow',
          session_timeout: 60
        })
        .build();

      expect(config).toEqual({
        type: 'clickhouse',
        host: 'localhost',
        port: 8123,
        database: 'default',
        username: 'default',
        clickhouse: {
          format: 'JSONEachRow',
          session_timeout: 60
        }
      });
    });

    it('should build DuckDB config', () => {
      const config = DatabaseConfigBuilder.create()
        .type('duckdb')
        .filename('test.duckdb')
        .maxConnections(3)
        .build();

      expect(config).toEqual({
        type: 'duckdb',
        filename: 'test.duckdb',
        maxConnections: 3
      });
    });

    it('should build config with connection string', () => {
      const config = DatabaseConfigBuilder.create()
        .type('postgresql')
        .connectionString('postgresql://user:pass@localhost:5432/testdb')
        .build();

      expect(config).toEqual({
        type: 'postgresql',
        connectionString: 'postgresql://user:pass@localhost:5432/testdb'
      });
    });

    it('should throw error when type is missing', () => {
      expect(() => {
        DatabaseConfigBuilder.create()
          .database('test.db')
          .build();
      }).toThrow('Database type is required');
    });

    it('should allow method chaining', () => {
      const builder = DatabaseConfigBuilder.create();
      const result = builder
        .type('sqlite')
        .database('test.db');
      
      expect(result).toBe(builder);
    });
  });

  describe('DatabaseConfigValidator', () => {
    describe('validate', () => {
      it('should return no errors for valid SQLite config', () => {
        const config: DatabaseConfig = {
          type: 'sqlite',
          database: 'test.db'
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toEqual([]);
      });

      it('should return no errors for valid PostgreSQL config', () => {
        const config: DatabaseConfig = {
          type: 'postgresql',
          host: 'localhost',
          database: 'testdb',
          port: 5432
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toEqual([]);
      });

      it('should return error for missing type', () => {
        const config = {} as DatabaseConfig;

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('Database type is required');
      });

      it('should return error for SQLite without database or filename', () => {
        const config: DatabaseConfig = {
          type: 'sqlite'
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('SQLite requires either database or filename');
      });

      it('should return error for PostgreSQL without connection info', () => {
        const config: DatabaseConfig = {
          type: 'postgresql'
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('PostgreSQL requires either connectionString or host/database');
      });

      it('should return error for invalid port', () => {
        const config: DatabaseConfig = {
          type: 'postgresql',
          host: 'localhost',
          database: 'testdb',
          port: 70000
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('PostgreSQL port must be between 1 and 65535');
      });

      it('should return error for invalid maxConnections', () => {
        const config: DatabaseConfig = {
          type: 'sqlite',
          database: 'test.db',
          maxConnections: -1
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('maxConnections must be greater than 0');
      });

      it('should return error for invalid pool config', () => {
        const config: DatabaseConfig = {
          type: 'postgresql',
          host: 'localhost',
          database: 'testdb',
          pool: {
            min: 10,
            max: 5
          }
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('Pool min connections cannot be greater than max connections');
      });

      it('should return error for unsupported database type', () => {
        const config: DatabaseConfig = {
          type: 'mysql' as any,
          database: 'testdb'
        };

        const errors = DatabaseConfigValidator.validate(config);
        expect(errors).toContain('Unsupported database type: mysql');
      });
    });

    describe('isValid', () => {
      it('should return true for valid config', () => {
        const config: DatabaseConfig = {
          type: 'sqlite',
          database: 'test.db'
        };

        expect(DatabaseConfigValidator.isValid(config)).toBe(true);
      });

      it('should return false for invalid config', () => {
        const config: DatabaseConfig = {
          type: 'sqlite'
        };

        expect(DatabaseConfigValidator.isValid(config)).toBe(false);
      });
    });
  });

  describe('DatabaseDefaults', () => {
    it('should have defaults for all supported database types', () => {
      expect(DatabaseDefaults.sqlite).toBeDefined();
      expect(DatabaseDefaults.postgresql).toBeDefined();
      expect(DatabaseDefaults.clickhouse).toBeDefined();
      expect(DatabaseDefaults.duckdb).toBeDefined();
    });

    it('should have reasonable SQLite defaults', () => {
      expect(DatabaseDefaults.sqlite.maxConnections).toBe(10);
      expect(DatabaseDefaults.sqlite.filename).toBe(':memory:');
    });

    it('should have reasonable PostgreSQL defaults', () => {
      expect(DatabaseDefaults.postgresql.port).toBe(5432);
      expect(DatabaseDefaults.postgresql.maxConnections).toBe(20);
      expect(DatabaseDefaults.postgresql.pool).toBeDefined();
    });

    it('should have reasonable ClickHouse defaults', () => {
      expect(DatabaseDefaults.clickhouse.port).toBe(8123);
      expect(DatabaseDefaults.clickhouse.username).toBe('default');
      expect(DatabaseDefaults.clickhouse.clickhouse?.format).toBe('JSONEachRow');
    });

    it('should have reasonable DuckDB defaults', () => {
      expect(DatabaseDefaults.duckdb.maxConnections).toBe(5);
      expect(DatabaseDefaults.duckdb.filename).toBe(':memory:');
    });
  });

  describe('createDefaultConfig', () => {
    it('should create SQLite config with defaults', () => {
      const config = createDefaultConfig('sqlite');
      
      expect(config.type).toBe('sqlite');
      expect(config.maxConnections).toBe(10);
      expect(config.filename).toBe(':memory:');
    });

    it('should create PostgreSQL config with defaults', () => {
      const config = createDefaultConfig('postgresql');
      
      expect(config.type).toBe('postgresql');
      expect(config.port).toBe(5432);
      expect(config.maxConnections).toBe(20);
      expect(config.pool).toBeDefined();
    });

    it('should override defaults with provided values', () => {
      const config = createDefaultConfig('sqlite', {
        database: 'custom.db',
        maxConnections: 5
      });
      
      expect(config.type).toBe('sqlite');
      expect(config.database).toBe('custom.db');
      expect(config.maxConnections).toBe(5);
      expect(config.filename).toBe(':memory:'); // Default should still be present
    });

    it('should create ClickHouse config with defaults', () => {
      const config = createDefaultConfig('clickhouse');
      
      expect(config.type).toBe('clickhouse');
      expect(config.port).toBe(8123);
      expect(config.username).toBe('default');
      expect(config.clickhouse?.format).toBe('JSONEachRow');
    });

    it('should create DuckDB config with defaults', () => {
      const config = createDefaultConfig('duckdb');
      
      expect(config.type).toBe('duckdb');
      expect(config.maxConnections).toBe(5);
      expect(config.filename).toBe(':memory:');
    });
  });
});