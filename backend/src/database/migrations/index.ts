/**
 * Database migrations index
 */

export * from './types';
export { MigrationRunner } from './MigrationRunner';
export { createLogEntriesTableMigration } from './001_create_log_entries_table';
export { addPerformanceIndexesMigration } from './002_add_performance_indexes';
export { createAggregationTablesMigration } from './003_create_aggregation_tables';
export { optimizePaginationMigration } from './004_optimize_pagination';
export { createDownloadBatchesTableMigration } from './005_create_download_batches_table';
export { addConnectionIdFieldMigration } from './006_add_connection_id_field';

// Export all migrations in order
import { createLogEntriesTableMigration } from './001_create_log_entries_table';
import { addPerformanceIndexesMigration } from './002_add_performance_indexes';
import { createAggregationTablesMigration } from './003_create_aggregation_tables';
import { optimizePaginationMigration } from './004_optimize_pagination';
import { createDownloadBatchesTableMigration } from './005_create_download_batches_table';
import { addConnectionIdFieldMigration } from './006_add_connection_id_field';

export const allMigrations = [
  createLogEntriesTableMigration,
  addPerformanceIndexesMigration,
  createAggregationTablesMigration,
  optimizePaginationMigration,
  createDownloadBatchesTableMigration,
  addConnectionIdFieldMigration
];