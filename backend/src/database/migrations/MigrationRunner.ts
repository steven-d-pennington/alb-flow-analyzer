/**
 * Database migration runner
 */

import { DatabaseConnection } from '../types';
import { Migration, MigrationRecord, MigrationRunner as IMigrationRunner, MigrationConfig } from './types';
import { createHash } from 'crypto';

export class MigrationRunner implements IMigrationRunner {
  private connection: DatabaseConnection;
  private config: MigrationConfig;
  private migrations: Migration[] = [];

  constructor(connection: DatabaseConnection, config: MigrationConfig = {}) {
    this.connection = connection;
    this.config = {
      tableName: 'schema_migrations',
      ...config
    };
  }

  /**
   * Register a migration
   */
  addMigration(migration: Migration): void {
    this.migrations.push(migration);
  }

  /**
   * Register multiple migrations
   */
  addMigrations(migrations: Migration[]): void {
    this.migrations.push(...migrations);
  }

  /**
   * Create the migrations tracking table
   */
  async createMigrationsTable(): Promise<void> {
    // Use database-specific SQL for timestamp type
    const timestampType = this.getTimestampType();
    const defaultTimestamp = this.getDefaultTimestamp();
    
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at ${timestampType} NOT NULL DEFAULT ${defaultTimestamp},
        checksum TEXT NOT NULL
      )
    `;
    
    await this.connection.execute(sql);
  }

  /**
   * Get the appropriate timestamp type for the database
   */
  private getTimestampType(): string {
    // For PostgreSQL, we need to determine the database type from connection
    // For now, assume PostgreSQL if we're using this optimized path
    return 'TIMESTAMP';
  }

  /**
   * Get the appropriate default timestamp for the database
   */
  private getDefaultTimestamp(): string {
    // For PostgreSQL
    return 'NOW()';
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    await this.createMigrationsTable();
    
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to run');
      return;
    }

    console.log(`Running ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      await this.runSingleMigration(migration);
    }

    console.log('All migrations completed successfully');
  }

  /**
   * Rollback a specific migration
   */
  async rollbackMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    const executedMigrations = await this.getExecutedMigrations();
    const executedMigration = executedMigrations.find(m => m.id === migrationId);
    
    if (!executedMigration) {
      throw new Error(`Migration ${migrationId} has not been executed`);
    }

    console.log(`Rolling back migration: ${migration.name}`);

    try {
      await this.connection.beginTransaction();
      
      // Run the down migration
      await migration.down(this.connection);
      
      // Remove from migrations table
      await this.connection.execute(
        `DELETE FROM ${this.config.tableName} WHERE id = ?`,
        [migrationId]
      );
      
      await this.connection.commit();
      console.log(`Successfully rolled back migration: ${migration.name}`);
    } catch (error) {
      await this.connection.rollback();
      throw new Error(`Failed to rollback migration ${migration.name}: ${error}`);
    }
  }

  /**
   * Get migrations that haven't been executed yet
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const executedMigrations = await this.getExecutedMigrations();
    const executedIds = new Set(executedMigrations.map(m => m.id));
    
    return this.migrations.filter(migration => !executedIds.has(migration.id));
  }

  /**
   * Get migrations that have been executed
   */
  async getExecutedMigrations(): Promise<MigrationRecord[]> {
    try {
      const result = await this.connection.query<MigrationRecord>(
        `SELECT id, name, executed_at, checksum FROM ${this.config.tableName} ORDER BY executed_at`
      );
      return result.rows;
    } catch (error) {
      // If table doesn't exist, return empty array
      return [];
    }
  }

  /**
   * Run a single migration
   */
  private async runSingleMigration(migration: Migration): Promise<void> {
    console.log(`Running migration: ${migration.name}`);
    
    const checksum = this.calculateMigrationChecksum(migration);
    
    try {
      await this.connection.beginTransaction();
      
      // Run the up migration
      await migration.up(this.connection);
      
      // Record the migration
      await this.connection.execute(
        `INSERT INTO ${this.config.tableName} (id, name, executed_at, checksum) VALUES (?, ?, ?, ?)`,
        [migration.id, migration.name, new Date().toISOString(), checksum]
      );
      
      await this.connection.commit();
      console.log(`Successfully executed migration: ${migration.name}`);
    } catch (error) {
      await this.connection.rollback();
      throw new Error(`Failed to execute migration ${migration.name}: ${error}`);
    }
  }

  /**
   * Calculate checksum for migration integrity
   */
  private calculateMigrationChecksum(migration: Migration): string {
    const content = migration.up.toString() + migration.down.toString();
    return createHash('sha256').update(content).digest('hex');
  }
}