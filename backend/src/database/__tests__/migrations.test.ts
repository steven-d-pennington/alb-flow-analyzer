/**
 * Tests for database migration system
 */

import { MigrationRunner } from '../migrations/MigrationRunner';
import { Migration } from '../migrations/types';
import { DatabaseConnection, QueryResult, ExecuteResult } from '../types';

// Mock database connection for testing
class MockDatabaseConnection implements DatabaseConnection {
  private tables: Map<string, any[]> = new Map();
  private inTransaction = false;
  
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    // Mock implementation for testing
    if (sql.includes('schema_migrations')) {
      const migrations = this.tables.get('schema_migrations') || [];
      return {
        rows: migrations as T[],
        rowCount: migrations.length
      };
    }
    
    if (sql.includes('sqlite_master')) {
      if (sql.includes("name='log_entries'")) {
        const hasTable = this.tables.has('log_entries');
        return {
          rows: hasTable ? [{ name: 'log_entries' }] as T[] : [],
          rowCount: hasTable ? 1 : 0
        };
      }
      
      if (sql.includes("type='index'")) {
        // Mock index results
        const indexes = [
          { name: 'idx_log_entries_timestamp' },
          { name: 'idx_log_entries_request_url' },
          { name: 'idx_log_entries_elb_status_code' },
          { name: 'idx_log_entries_client_ip' }
        ];
        return {
          rows: indexes as T[],
          rowCount: indexes.length
        };
      }
    }
    
    return { rows: [], rowCount: 0 };
  }
  
  async execute(sql: string, params?: any[]): Promise<ExecuteResult> {
    if (sql.includes('CREATE TABLE schema_migrations')) {
      this.tables.set('schema_migrations', []);
    } else if (sql.includes('CREATE TABLE log_entries')) {
      this.tables.set('log_entries', []);
    } else if (sql.includes('INSERT INTO schema_migrations')) {
      const migrations = this.tables.get('schema_migrations') || [];
      migrations.push({
        id: params?.[0],
        name: params?.[1],
        executed_at: params?.[2],
        checksum: params?.[3]
      });
      this.tables.set('schema_migrations', migrations);
    } else if (sql.includes('DELETE FROM schema_migrations')) {
      const migrations = this.tables.get('schema_migrations') || [];
      const filtered = migrations.filter(m => m.id !== params?.[0]);
      this.tables.set('schema_migrations', filtered);
    } else if (sql.includes('DROP TABLE')) {
      if (sql.includes('log_entries')) {
        this.tables.delete('log_entries');
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

describe('MigrationRunner', () => {
  let connection: MockDatabaseConnection;
  let migrationRunner: MigrationRunner;
  
  const testMigration: Migration = {
    id: 'test_001',
    name: 'test_migration',
    async up(conn: DatabaseConnection) {
      await conn.execute('CREATE TABLE test_table (id INTEGER PRIMARY KEY)');
    },
    async down(conn: DatabaseConnection) {
      await conn.execute('DROP TABLE test_table');
    }
  };
  
  beforeEach(() => {
    connection = new MockDatabaseConnection();
    migrationRunner = new MigrationRunner(connection);
  });
  
  describe('createMigrationsTable', () => {
    it('should create the schema_migrations table', async () => {
      await migrationRunner.createMigrationsTable();
      
      const result = await connection.query('SELECT * FROM schema_migrations');
      expect(result.rowCount).toBe(0); // Table exists but empty
    });
  });
  
  describe('addMigration', () => {
    it('should add a migration to the runner', () => {
      migrationRunner.addMigration(testMigration);
      
      // Test that migration was added by checking pending migrations
      expect(migrationRunner.getPendingMigrations()).resolves.toHaveLength(1);
    });
  });
  
  describe('runMigrations', () => {
    it('should run pending migrations', async () => {
      migrationRunner.addMigration(testMigration);
      
      await migrationRunner.runMigrations();
      
      const executedMigrations = await migrationRunner.getExecutedMigrations();
      expect(executedMigrations).toHaveLength(1);
      expect(executedMigrations[0].id).toBe('test_001');
      expect(executedMigrations[0].name).toBe('test_migration');
    });
    
    it('should not run already executed migrations', async () => {
      migrationRunner.addMigration(testMigration);
      
      // Run migrations twice
      await migrationRunner.runMigrations();
      await migrationRunner.runMigrations();
      
      const executedMigrations = await migrationRunner.getExecutedMigrations();
      expect(executedMigrations).toHaveLength(1); // Should still be 1
    });
  });
  
  describe('rollbackMigration', () => {
    it('should rollback an executed migration', async () => {
      migrationRunner.addMigration(testMigration);
      
      // First run the migration
      await migrationRunner.runMigrations();
      expect(await migrationRunner.getExecutedMigrations()).toHaveLength(1);
      
      // Then rollback
      await migrationRunner.rollbackMigration('test_001');
      expect(await migrationRunner.getExecutedMigrations()).toHaveLength(0);
    });
    
    it('should throw error when rolling back non-existent migration', async () => {
      await expect(migrationRunner.rollbackMigration('non_existent'))
        .rejects.toThrow('Migration non_existent not found');
    });
    
    it('should throw error when rolling back unexecuted migration', async () => {
      migrationRunner.addMigration(testMigration);
      
      await expect(migrationRunner.rollbackMigration('test_001'))
        .rejects.toThrow('Migration test_001 has not been executed');
    });
  });
  
  describe('getPendingMigrations', () => {
    it('should return migrations that have not been executed', async () => {
      migrationRunner.addMigration(testMigration);
      
      const pendingBefore = await migrationRunner.getPendingMigrations();
      expect(pendingBefore).toHaveLength(1);
      
      await migrationRunner.runMigrations();
      
      const pendingAfter = await migrationRunner.getPendingMigrations();
      expect(pendingAfter).toHaveLength(0);
    });
  });
  
  describe('getExecutedMigrations', () => {
    it('should return empty array when no migrations executed', async () => {
      const executed = await migrationRunner.getExecutedMigrations();
      expect(executed).toHaveLength(0);
    });
    
    it('should return executed migrations in order', async () => {
      const migration2: Migration = {
        id: 'test_002',
        name: 'test_migration_2',
        async up() {},
        async down() {}
      };
      
      migrationRunner.addMigration(testMigration);
      migrationRunner.addMigration(migration2);
      
      await migrationRunner.runMigrations();
      
      const executed = await migrationRunner.getExecutedMigrations();
      expect(executed).toHaveLength(2);
      expect(executed[0].id).toBe('test_001');
      expect(executed[1].id).toBe('test_002');
    });
  });
});