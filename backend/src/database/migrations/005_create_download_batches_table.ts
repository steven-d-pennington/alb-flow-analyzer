import { Migration } from './types';
import { DatabaseConnection } from '../types';

export const createDownloadBatchesTableMigration: Migration = {
  id: '005',
  name: 'create_download_batches_table',
  
  async up(connection: DatabaseConnection): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS download_batches (
        batch_id TEXT PRIMARY KEY,
        batch_name TEXT NOT NULL,
        download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_count INTEGER NOT NULL DEFAULT 0,
        total_size_bytes INTEGER NOT NULL DEFAULT 0,
        s3_file_paths TEXT NOT NULL, -- JSON array
        local_file_paths TEXT NOT NULL, -- JSON array
        status TEXT NOT NULL DEFAULT 'pending', -- pending, downloading, completed, error
        error_message TEXT,
        download_started_at DATETIME,
        download_completed_at DATETIME,
        estimated_size_bytes INTEGER DEFAULT 0,
        progress_percentage INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_download_batches_status ON download_batches(status);
      CREATE INDEX IF NOT EXISTS idx_download_batches_date ON download_batches(download_date);
      CREATE INDEX IF NOT EXISTS idx_download_batches_created ON download_batches(created_at);
    `;

    await connection.execute(createTableQuery);
    await connection.execute(createIndexQuery);
  },

  async down(connection: DatabaseConnection): Promise<void> {
    await connection.execute('DROP INDEX IF EXISTS idx_download_batches_status');
    await connection.execute('DROP INDEX IF EXISTS idx_download_batches_date');
    await connection.execute('DROP INDEX IF EXISTS idx_download_batches_created');
    await connection.execute('DROP TABLE IF EXISTS download_batches');
  }
}