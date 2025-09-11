/**
 * Database module main exports
 */

export * from './types';
export * from './ConnectionFactory';
export * from './config';
export * from './schema';
export * from './migrations';
export * from './DataStore';
export * from './OptimizedConnectionPool';
export * from './AggregationService';
export * from './adapters/SqliteAdapter';
export * from './adapters/PostgresAdapter';
export * from './adapters/ClickHouseAdapter';
export * from './adapters/DuckDBAdapter';

// Re-export the singleton factory instance for convenience
import { ConnectionFactory } from './ConnectionFactory';
export const connectionFactory = ConnectionFactory.getInstance();