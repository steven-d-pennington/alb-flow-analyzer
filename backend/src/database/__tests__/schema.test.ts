/**
 * Tests for database schema management
 */

import { DatabaseSchemaManager } from '../schema';
import { DatabaseConnection, QueryResult, ExecuteResult } from '../types';

// Mock database connection for testing
class MockDatabaseConnection implements DatabaseConnection {
  private tables: Map<string, any[]> = new Map();
  private indexes: Map<string, any[]> = new Map();
  private inTransaction = false;
  
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (sql.includes('schema_migrations')) {
      const migrations = this.tables.get('schema_migrations') || [];
      return {
        rows: migrations as T[],
        rowCount: migrations.length
      };
    }
    
    if (sql.includes('sqlite_master')) {
      if (sql.includes("type='table'") && sql.includes("name='log_entries'")) {
        const hasTable = this.tables.has('log_entries');
        return {
          rows: hasTable ? [{ name: 'log_entries' }] as T[] : [],
          rowCount: hasTable ? 1 : 0
        };
      }
      
      if (sql.includes("type='index'") && sql.includes("tbl_name='log_entries'")) {
        const indexList = Array.from(this.indexes.get('log_entries') || []).map((idx: any) => ({ 
          name: idx.name, 
          sql: `CREATE INDEX ${idx.name} ON log_entries(...)`
        }));
        return {
          rows: indexList as T[],
          rowCount: indexList.length
        };
      }
    }
    
    if (sql.includes('PRAGMA table_info')) {
      const columns = [
        { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
        { cid: 1, name: 'timestamp', type: 'DATETIME', notnull: 1, dflt_value: null, pk: 0 },
        { cid: 2, name: 'client_ip', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 3, name: 'target_ip', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 4, name: 'request_processing_time', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 5, name: 'elb_status_code', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 6, name: 'request_url', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 }
      ];
      return {
        rows: columns as T[],
        rowCount: columns.length
      };
    }
    
    return { rows: [], rowCount: 0 };
  }
  
  async execute(sql: string, params?: any[]): Promise<ExecuteResult> {
    if (sql.includes('CREATE TABLE schema_migrations')) {
      this.tables.set('schema_migrations', []);
    } else if (sql.includes('CREATE TABLE log_entries')) {
      this.tables.set('log_entries', []);
      // Initialize the indexes array for log_entries table
      this.indexes.set('log_entries', []);
    } else if (sql.includes('INSERT INTO schema_migrations')) {
      const migrations = this.tables.get('schema_migrations') || [];
      migrations.push({
        id: params?.[0],
        name: params?.[1],
        executed_at: params?.[2],
        checksum: params?.[3]
      });
      this.tables.set('schema_migrations', migrations);
    } else if (sql.includes('CREATE INDEX')) {
      // Mock index creation
      const indexName = sql.match(/CREATE INDEX (\w+)/)?.[1];
      if (indexName) {
        const indexes = this.indexes.get('log_entries') || [];
        indexes.push({ name: indexName });
        this.indexes.set('log_entries', indexes);
      }
    } else if (sql.includes('DELETE FROM schema_migrations')) {
      const migrations = this.tables.get('schema_migrations') || [];
      const filtered = migrations.filter(m => m.id !== params?.[0]);
      this.tables.set('schema_migrations', filtered);
    } else if (sql.includes('DROP TABLE') && sql.includes('log_entries')) {
      this.tables.delete('log_entries');
      this.indexes.delete('log_entries');
    } else if (sql.includes('DROP INDEX')) {
      const indexName = sql.match(/DROP INDEX IF EXISTS (\w+)/)?.[1];
      if (indexName) {
        const indexes = this.indexes.get('log_entries') || [];
        const filtered = indexes.filter((idx: any) => idx.name !== indexName);
        this.indexes.set('log_entries', filtered);
      }
    }
    
    return { affectedRows: 1 };
  }
  
  async beginTransaction(): Promise<void> {
    this.inTransaction = true;
  }
  
  async commit(): Promise<void> {
    this.inTransaction = false;
  }
  
  async rollback(): Promise<void> {
    this.inTransaction = false;
  }
  
  async close(): Promise<void> {
    // Mock implementation
  }
  
  isConnected(): boolean {
    return true;
  }
}

describe('DatabaseSchemaManager', () => {
  let connection: MockDatabaseConnection;
  let schemaManager: DatabaseSchemaManager;
  
  beforeEach(() => {
    connection = new MockDatabaseConnection();
    schemaManager = new DatabaseSchemaManager(connection);
  });
  
  describe('initializeSchema', () => {
    it('should initialize the database schema', async () => {
      await schemaManager.initializeSchema();
      
      // Verify that migrations were run
      const version = await schemaManager.getSchemaVersion();
      expect(version).toBe('001'); // Should be the latest migration ID
    });
  });
  
  describe('runMigrations', () => {
    it('should run pending migrations', async () => {
      await schemaManager.runMigrations();
      
      const version = await schemaManager.getSchemaVersion();
      expect(version).toBe('001');
    });
  });
  
  describe('getSchemaVersion', () => {
    it('should return null when no migrations have been run', async () => {
      const version = await schemaManager.getSchemaVersion();
      expect(version).toBeNull();
    });
    
    it('should return the latest migration ID after running migrations', async () => {
      await schemaManager.runMigrations();
      
      const version = await schemaManager.getSchemaVersion();
      expect(version).toBe('001');
    });
  });
  
  describe('validateSchema', () => {
    it('should return false when schema is not initialized', async () => {
      const isValid = await schemaManager.validateSchema();
      expect(isValid).toBe(false);
    });
    
    it('should return true when schema is properly initialized', async () => {
      await schemaManager.initializeSchema();
      
      const isValid = await schemaManager.validateSchema();
      expect(isValid).toBe(true);
    });
  });
  
  describe('getTableInfo', () => {
    it('should return table information', async () => {
      await schemaManager.initializeSchema();
      
      const tableInfo = await schemaManager.getTableInfo();
      expect(tableInfo).toBeInstanceOf(Array);
      expect(tableInfo.length).toBeGreaterThan(0);
      
      // Check for key columns
      const columnNames = tableInfo.map((col: any) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('client_ip');
      expect(columnNames).toContain('elb_status_code');
      expect(columnNames).toContain('request_url');
    });
  });
  
  describe('getIndexInfo', () => {
    it('should return index information', async () => {
      await schemaManager.initializeSchema();
      
      const indexInfo = await schemaManager.getIndexInfo();
      expect(indexInfo).toBeInstanceOf(Array);
      expect(indexInfo.length).toBeGreaterThan(0);
      
      // Check for required indexes
      const indexNames = indexInfo.map((idx: any) => idx.name);
      expect(indexNames).toContain('idx_log_entries_timestamp');
      expect(indexNames).toContain('idx_log_entries_request_url');
      expect(indexNames).toContain('idx_log_entries_elb_status_code');
      expect(indexNames).toContain('idx_log_entries_client_ip');
    });
  });
  
  describe('rollbackMigration', () => {
    it('should rollback a migration', async () => {
      await schemaManager.initializeSchema();
      
      const versionBefore = await schemaManager.getSchemaVersion();
      expect(versionBefore).toBe('001');
      
      await schemaManager.rollbackMigration('001');
      
      const versionAfter = await schemaManager.getSchemaVersion();
      expect(versionAfter).toBeNull();
    });
  });
});