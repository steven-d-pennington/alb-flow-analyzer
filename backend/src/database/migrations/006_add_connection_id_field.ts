/**
 * Migration: Add connection_id field to log_entries table for better client tracking
 */

import { Migration } from './types';
import { DatabaseConnection } from '../types';

export const addConnectionIdFieldMigration: Migration = {
  id: '006',
  name: 'add_connection_id_field',
  
  async up(connection: DatabaseConnection): Promise<void> {
    // Add connection_id column to log_entries table
    await connection.execute(`
      ALTER TABLE log_entries 
      ADD COLUMN connection_id TEXT DEFAULT ''
    `);
    
    // Create index for connection_id for efficient grouping and analysis
    await connection.execute(`
      CREATE INDEX idx_log_entries_connection_id ON log_entries(connection_id)
    `);
    
    // Create composite index for timestamp + connection_id queries
    await connection.execute(`
      CREATE INDEX idx_log_entries_timestamp_connection_id ON log_entries(timestamp, connection_id)
    `);
  },
  
  async down(connection: DatabaseConnection): Promise<void> {
    // Drop indexes first
    await connection.execute('DROP INDEX IF EXISTS idx_log_entries_connection_id');
    await connection.execute('DROP INDEX IF EXISTS idx_log_entries_timestamp_connection_id');
    
    // Note: SQLite doesn't support DROP COLUMN directly
    // In a production environment, you'd need to recreate the table without the column
    // For now, we'll just clear the values
    await connection.execute(`
      UPDATE log_entries SET connection_id = NULL
    `);
  }
};