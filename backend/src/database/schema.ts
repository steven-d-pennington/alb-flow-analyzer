/**
 * Database schema utilities and management
 */

import { DatabaseConnection } from './types';
import { MigrationRunner } from './migrations/MigrationRunner';
import { allMigrations } from './migrations';

export interface SchemaManager {
  initializeSchema(): Promise<void>;
  runMigrations(): Promise<void>;
  rollbackMigration(migrationId: string): Promise<void>;
  getSchemaVersion(): Promise<string | null>;
  validateSchema(): Promise<boolean>;
}

export class DatabaseSchemaManager implements SchemaManager {
  private connection: DatabaseConnection;
  private migrationRunner: MigrationRunner;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
    this.migrationRunner = new MigrationRunner(connection);
    
    // Register all migrations
    this.migrationRunner.addMigrations(allMigrations);
  }

  /**
   * Initialize the database schema by running all migrations
   */
  async initializeSchema(): Promise<void> {
    await this.migrationRunner.runMigrations();
  }

  /**
   * Run pending migrations
   */
  async runMigrations(): Promise<void> {
    await this.migrationRunner.runMigrations();
  }

  /**
   * Rollback a specific migration
   */
  async rollbackMigration(migrationId: string): Promise<void> {
    await this.migrationRunner.rollbackMigration(migrationId);
  }

  /**
   * Get the current schema version (latest executed migration)
   */
  async getSchemaVersion(): Promise<string | null> {
    try {
      const executedMigrations = await this.migrationRunner.getExecutedMigrations();
      if (executedMigrations.length === 0) {
        return null;
      }
      
      // Return the latest migration ID
      return executedMigrations[executedMigrations.length - 1].id;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate that the schema is properly set up
   */
  async validateSchema(): Promise<boolean> {
    try {
      // Check if log_entries table exists and has expected structure
      const result = await this.connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='log_entries'
      `);
      
      if (result.rows.length === 0) {
        return false;
      }

      // Check if required indexes exist
      const indexResult = await this.connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND tbl_name='log_entries'
      `);
      
      const expectedIndexes = [
        'idx_log_entries_timestamp',
        'idx_log_entries_request_url',
        'idx_log_entries_elb_status_code',
        'idx_log_entries_client_ip'
      ];
      
      const existingIndexes = indexResult.rows.map((row: any) => row.name);
      const hasRequiredIndexes = expectedIndexes.every(index => 
        existingIndexes.includes(index)
      );
      
      return hasRequiredIndexes;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get table information for debugging
   */
  async getTableInfo(): Promise<any[]> {
    try {
      const result = await this.connection.query(`
        PRAGMA table_info(log_entries)
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get index information for debugging
   */
  async getIndexInfo(): Promise<any[]> {
    try {
      const result = await this.connection.query(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='index' AND tbl_name='log_entries'
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }
}