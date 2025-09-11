/**
 * Migration system types and interfaces
 */

export interface Migration {
  id: string;
  name: string;
  up: (connection: any) => Promise<void>;
  down: (connection: any) => Promise<void>;
}

export interface MigrationRecord {
  id: string;
  name: string;
  executed_at: Date;
  checksum: string;
}

export interface MigrationRunner {
  runMigrations(): Promise<void>;
  rollbackMigration(migrationId: string): Promise<void>;
  getPendingMigrations(): Promise<Migration[]>;
  getExecutedMigrations(): Promise<MigrationRecord[]>;
  createMigrationsTable(): Promise<void>;
}

export interface MigrationConfig {
  migrationsPath?: string;
  tableName?: string;
}