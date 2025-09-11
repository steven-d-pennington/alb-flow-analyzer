/**
 * Unit tests for ConnectionFactory
 */

import { ConnectionFactory } from '../ConnectionFactory';
import { DatabaseConfig, DatabaseType } from '../types';

describe('ConnectionFactory', () => {
  let factory: ConnectionFactory;

  beforeEach(() => {
    factory = ConnectionFactory.getInstance();
  });

  afterEach(async () => {
    await factory.closeAllPools();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const factory1 = ConnectionFactory.getInstance();
      const factory2 = ConnectionFactory.getInstance();
      expect(factory1).toBe(factory2);
    });
  });

  describe('getSupportedTypes', () => {
    it('should return all supported database types', () => {
      const types = factory.getSupportedTypes();
      expect(types).toEqual(['sqlite', 'postgresql', 'clickhouse', 'duckdb']);
    });
  });

  describe('validateConfig', () => {
    it('should validate SQLite config with database', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:'
      };
      
      await expect(factory.validateConfig(config)).resolves.toBe(true);
    });

    it('should validate SQLite config with filename', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        filename: 'test.db'
      };
      
      await expect(factory.validateConfig(config)).resolves.toBe(true);
    });

    it('should validate PostgreSQL config with connection string', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        connectionString: 'postgresql://user:pass@localhost:5432/testdb'
      };
      
      await expect(factory.validateConfig(config)).resolves.toBe(true);
    });

    it('should validate PostgreSQL config with host/database', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        database: 'testdb'
      };
      
      await expect(factory.validateConfig(config)).resolves.toBe(true);
    });

    it('should validate ClickHouse config', async () => {
      const config: DatabaseConfig = {
        type: 'clickhouse',
        host: 'localhost',
        database: 'default'
      };
      
      await expect(factory.validateConfig(config)).resolves.toBe(true);
    });

    it('should validate DuckDB config', async () => {
      const config: DatabaseConfig = {
        type: 'duckdb',
        database: ':memory:'
      };
      
      await expect(factory.validateConfig(config)).resolves.toBe(true);
    });

    it('should throw error for missing type', async () => {
      const config = {} as DatabaseConfig;
      
      await expect(factory.validateConfig(config)).rejects.toThrow('Database type is required');
    });

    it('should throw error for unsupported type', async () => {
      const config: DatabaseConfig = {
        type: 'mysql' as DatabaseType,
        database: 'test'
      };
      
      await expect(factory.validateConfig(config)).rejects.toThrow('Unsupported database type: mysql');
    });

    it('should throw error for SQLite without database or filename', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite'
      };
      
      await expect(factory.validateConfig(config)).rejects.toThrow('SQLite requires either database or filename');
    });

    it('should throw error for PostgreSQL without connection info', async () => {
      const config: DatabaseConfig = {
        type: 'postgresql'
      };
      
      await expect(factory.validateConfig(config)).rejects.toThrow('PostgreSQL requires either connectionString or host/database');
    });

    it('should throw error for ClickHouse without connection info', async () => {
      const config: DatabaseConfig = {
        type: 'clickhouse'
      };
      
      await expect(factory.validateConfig(config)).rejects.toThrow('ClickHouse requires either connectionString or host/database');
    });

    it('should throw error for DuckDB without database or filename', async () => {
      const config: DatabaseConfig = {
        type: 'duckdb'
      };
      
      await expect(factory.validateConfig(config)).rejects.toThrow('DuckDB requires either database or filename');
    });
  });

  describe('createPool', () => {
    it('should create SQLite pool', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:'
      };
      
      const pool = await factory.createPool(config);
      expect(pool).toBeDefined();
      expect(pool.getStats).toBeDefined();
    });

    it('should reuse existing pool for same configuration', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:'
      };
      
      const pool1 = await factory.createPool(config);
      const pool2 = await factory.createPool(config);
      
      expect(pool1).toBe(pool2);
    });

    it('should throw error for invalid configuration', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite'
      };
      
      await expect(factory.createPool(config)).rejects.toThrow();
    });
  });

  describe('closePool', () => {
    it('should close specific pool', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:'
      };
      
      const pool = await factory.createPool(config);
      await factory.closePool(config);
      
      // Pool should be destroyed
      expect(pool.getStats().totalConnections).toBe(0);
    });

    it('should handle closing non-existent pool', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: 'non-existent.db'
      };
      
      await expect(factory.closePool(config)).resolves.not.toThrow();
    });
  });

  describe('closeAllPools', () => {
    it('should close all pools', async () => {
      const config1: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:'
      };
      
      const config2: DatabaseConfig = {
        type: 'duckdb',
        database: ':memory:'
      };
      
      await factory.createPool(config1);
      await factory.createPool(config2);
      
      await factory.closeAllPools();
      
      // Should not throw when creating new pools
      await expect(factory.createPool(config1)).resolves.toBeDefined();
    });
  });
});