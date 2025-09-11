/**
 * Tests for the log_entries table creation migration
 */

import { createLogEntriesTableMigration } from '../migrations/001_create_log_entries_table';
import { DatabaseConnection, QueryResult, ExecuteResult } from '../types';

// Mock database connection for testing
class MockDatabaseConnection implements DatabaseConnection {
  private executedStatements: string[] = [];
  private tables: Set<string> = new Set();
  private indexes: Set<string> = new Set();
  
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    // Mock PRAGMA table_info for log_entries
    if (sql.includes('PRAGMA table_info(log_entries)')) {
      if (this.tables.has('log_entries')) {
        const columns = [
          { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
          { cid: 1, name: 'timestamp', type: 'DATETIME', notnull: 1, dflt_value: null, pk: 0 },
          { cid: 2, name: 'client_ip', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 3, name: 'target_ip', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 4, name: 'request_processing_time', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 5, name: 'target_processing_time', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 6, name: 'response_processing_time', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 7, name: 'elb_status_code', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 8, name: 'target_status_code', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 9, name: 'received_bytes', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 10, name: 'sent_bytes', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 11, name: 'request_verb', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 12, name: 'request_url', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 13, name: 'request_protocol', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 14, name: 'user_agent', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 15, name: 'ssl_cipher', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 16, name: 'ssl_protocol', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 17, name: 'target_group_arn', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 18, name: 'trace_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 19, name: 'domain_name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 20, name: 'chosen_cert_arn', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 21, name: 'matched_rule_priority', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 22, name: 'request_creation_time', type: 'DATETIME', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 23, name: 'actions_executed', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 24, name: 'redirect_url', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 25, name: 'error_reason', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 26, name: 'target_port_list', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 27, name: 'target_status_code_list', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 28, name: 'classification', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 29, name: 'classification_reason', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 30, name: 'created_at', type: 'DATETIME', notnull: 0, dflt_value: 'CURRENT_TIMESTAMP', pk: 0 }
        ];
        return {
          rows: columns as T[],
          rowCount: columns.length
        };
      }
    }
    
    // Mock index listing
    if (sql.includes('sqlite_master') && sql.includes("type='index'")) {
      const indexList = Array.from(this.indexes).map(name => ({ name }));
      return {
        rows: indexList as T[],
        rowCount: indexList.length
      };
    }
    
    return { rows: [], rowCount: 0 };
  }
  
  async execute(sql: string, params?: any[]): Promise<ExecuteResult> {
    this.executedStatements.push(sql);
    
    if (sql.includes('CREATE TABLE log_entries')) {
      this.tables.add('log_entries');
    } else if (sql.includes('DROP TABLE') && sql.includes('log_entries')) {
      this.tables.delete('log_entries');
    } else if (sql.includes('CREATE INDEX')) {
      const indexMatch = sql.match(/CREATE INDEX (\w+)/);
      if (indexMatch) {
        this.indexes.add(indexMatch[1]);
      }
    } else if (sql.includes('DROP INDEX')) {
      const indexMatch = sql.match(/DROP INDEX IF EXISTS (\w+)/);
      if (indexMatch) {
        this.indexes.delete(indexMatch[1]);
      }
    }
    
    return { affectedRows: 1 };
  }
  
  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  async close(): Promise<void> {}
  isConnected(): boolean { return true; }
  
  // Test helper methods
  getExecutedStatements(): string[] {
    return this.executedStatements;
  }
  
  hasTable(tableName: string): boolean {
    return this.tables.has(tableName);
  }
  
  hasIndex(indexName: string): boolean {
    return this.indexes.has(indexName);
  }
  
  reset(): void {
    this.executedStatements = [];
    this.tables.clear();
    this.indexes.clear();
  }
}

describe('createLogEntriesTableMigration', () => {
  let connection: MockDatabaseConnection;
  
  beforeEach(() => {
    connection = new MockDatabaseConnection();
  });
  
  describe('migration properties', () => {
    it('should have correct migration metadata', () => {
      expect(createLogEntriesTableMigration.id).toBe('001');
      expect(createLogEntriesTableMigration.name).toBe('create_log_entries_table');
      expect(typeof createLogEntriesTableMigration.up).toBe('function');
      expect(typeof createLogEntriesTableMigration.down).toBe('function');
    });
  });
  
  describe('up migration', () => {
    it('should create the log_entries table', async () => {
      await createLogEntriesTableMigration.up(connection);
      
      expect(connection.hasTable('log_entries')).toBe(true);
    });
    
    it('should create all required indexes', async () => {
      await createLogEntriesTableMigration.up(connection);
      
      const expectedIndexes = [
        'idx_log_entries_timestamp',
        'idx_log_entries_request_url',
        'idx_log_entries_elb_status_code',
        'idx_log_entries_client_ip',
        'idx_log_entries_domain_name',
        'idx_log_entries_timestamp_status',
        'idx_log_entries_timestamp_url',
        'idx_log_entries_target_status_code'
      ];
      
      expectedIndexes.forEach(indexName => {
        expect(connection.hasIndex(indexName)).toBe(true);
      });
    });
    
    it('should execute CREATE TABLE statement with all ALB flow log fields', async () => {
      await createLogEntriesTableMigration.up(connection);
      
      const statements = connection.getExecutedStatements();
      const createTableStatement = statements.find(stmt => stmt.includes('CREATE TABLE log_entries'));
      
      expect(createTableStatement).toBeDefined();
      
      // Verify all required ALB flow log fields are present
      const requiredFields = [
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'timestamp DATETIME NOT NULL',
        'client_ip TEXT',
        'target_ip TEXT',
        'request_processing_time REAL',
        'target_processing_time REAL',
        'response_processing_time REAL',
        'elb_status_code INTEGER',
        'target_status_code INTEGER',
        'received_bytes INTEGER',
        'sent_bytes INTEGER',
        'request_verb TEXT',
        'request_url TEXT',
        'request_protocol TEXT',
        'user_agent TEXT',
        'ssl_cipher TEXT',
        'ssl_protocol TEXT',
        'target_group_arn TEXT',
        'trace_id TEXT',
        'domain_name TEXT',
        'chosen_cert_arn TEXT',
        'matched_rule_priority INTEGER',
        'request_creation_time DATETIME',
        'actions_executed TEXT',
        'redirect_url TEXT',
        'error_reason TEXT',
        'target_port_list TEXT',
        'target_status_code_list TEXT',
        'classification TEXT',
        'classification_reason TEXT',
        'created_at DATETIME DEFAULT CURRENT_TIMESTAMP'
      ];
      
      requiredFields.forEach(field => {
        expect(createTableStatement).toContain(field);
      });
    });
    
    it('should create indexes in the correct order', async () => {
      await createLogEntriesTableMigration.up(connection);
      
      const statements = connection.getExecutedStatements();
      const indexStatements = statements.filter(stmt => stmt.includes('CREATE INDEX'));
      
      expect(indexStatements).toHaveLength(8);
      
      // Verify specific index creation statements
      expect(indexStatements[0]).toContain('idx_log_entries_timestamp');
      expect(indexStatements[1]).toContain('idx_log_entries_request_url');
      expect(indexStatements[2]).toContain('idx_log_entries_elb_status_code');
      expect(indexStatements[3]).toContain('idx_log_entries_client_ip');
    });
  });
  
  describe('down migration', () => {
    it('should drop all indexes before dropping table', async () => {
      // First run up migration
      await createLogEntriesTableMigration.up(connection);
      connection.reset(); // Clear executed statements
      
      // Then run down migration
      await createLogEntriesTableMigration.down(connection);
      
      const statements = connection.getExecutedStatements();
      const dropIndexStatements = statements.filter(stmt => stmt.includes('DROP INDEX'));
      const dropTableStatement = statements.find(stmt => stmt.includes('DROP TABLE'));
      
      expect(dropIndexStatements).toHaveLength(8);
      expect(dropTableStatement).toBeDefined();
      
      // Verify indexes are dropped before table
      const dropTableIndex = statements.indexOf(dropTableStatement!);
      const lastDropIndexIndex = statements.lastIndexOf(dropIndexStatements[dropIndexStatements.length - 1]);
      expect(lastDropIndexIndex).toBeLessThan(dropTableIndex);
    });
    
    it('should drop the log_entries table', async () => {
      // First create the table
      await createLogEntriesTableMigration.up(connection);
      expect(connection.hasTable('log_entries')).toBe(true);
      
      // Then drop it
      await createLogEntriesTableMigration.down(connection);
      expect(connection.hasTable('log_entries')).toBe(false);
    });
    
    it('should use IF EXISTS clauses for safe cleanup', async () => {
      await createLogEntriesTableMigration.down(connection);
      
      const statements = connection.getExecutedStatements();
      const dropStatements = statements.filter(stmt => stmt.includes('DROP'));
      
      dropStatements.forEach(stmt => {
        expect(stmt).toContain('IF EXISTS');
      });
    });
  });
  
  describe('table structure validation', () => {
    it('should create table with correct column structure', async () => {
      await createLogEntriesTableMigration.up(connection);
      
      const tableInfo = await connection.query('PRAGMA table_info(log_entries)');
      const columns = tableInfo.rows;
      
      expect(columns).toHaveLength(31); // All ALB fields + id + created_at
      
      // Verify key columns exist with correct types
      const columnMap = new Map(columns.map((col: any) => [col.name, col]));
      
      expect(columnMap.get('id')?.type).toBe('INTEGER');
      expect(columnMap.get('id')?.pk).toBe(1);
      expect(columnMap.get('timestamp')?.type).toBe('DATETIME');
      expect(columnMap.get('timestamp')?.notnull).toBe(1);
      expect(columnMap.get('client_ip')?.type).toBe('TEXT');
      expect(columnMap.get('elb_status_code')?.type).toBe('INTEGER');
      expect(columnMap.get('request_processing_time')?.type).toBe('REAL');
    });
  });
});