import * as fs from 'fs/promises';
import * as path from 'path';
import { ConnectionPool, DatabaseConnection } from './types';

export interface BackupOptions {
  backupDir?: string;
  includeSchema?: boolean;
  includeData?: boolean;
  compress?: boolean;
  timestampSuffix?: boolean;
}

export interface BackupResult {
  backupPath: string;
  timestamp: Date;
  sizeBytes: number;
  tableStats: Record<string, number>;
  duration: number;
}

export class BackupService {
  private connection: ConnectionPool;
  private databaseType: string;

  constructor(connection: ConnectionPool) {
    this.connection = connection;
    // Get database type from environment
    this.databaseType = process.env.DATABASE_TYPE || 'sqlite';
  }

  /**
   * Helper to acquire and release a connection from the pool
   */
  private async withConnection<T>(fn: (conn: DatabaseConnection) => Promise<T>): Promise<T> {
    const conn = await this.connection.acquire();
    try {
      return await fn(conn);
    } finally {
      await this.connection.release(conn);
    }
  }

  /**
   * Create a full database backup
   */
  async createBackup(options: BackupOptions = {}): Promise<BackupResult> {
    const startTime = Date.now();
    
    const config = {
      backupDir: options.backupDir || './backups',
      includeSchema: options.includeSchema ?? true,
      includeData: options.includeData ?? true,
      compress: options.compress ?? false,
      timestampSuffix: options.timestampSuffix ?? true
    };

    // Ensure backup directory exists
    await fs.mkdir(config.backupDir, { recursive: true });

    // Generate backup filename
    const timestamp = new Date();
    const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
    const suffix = config.timestampSuffix ? `_${timestampStr}` : '';
    const extension = config.compress ? '.sql.gz' : '.sql';
    const backupPath = path.join(config.backupDir, `alb_logs_backup${suffix}${extension}`);

    let backupContent = '';
    const tableStats: Record<string, number> = {};

    try {
      // Add header comment
      backupContent += `-- ALB Flow Analyzer Database Backup\n`;
      backupContent += `-- Created: ${timestamp.toISOString()}\n`;
      backupContent += `-- Generator: ALB Flow Analyzer Backup Service\n\n`;

      // Get all tables
      const tables = await this.getTables();
      
      for (const tableName of tables) {
        console.log(`Backing up table: ${tableName}`);

        // Schema backup
        if (config.includeSchema) {
          const schema = await this.getTableSchema(tableName);
          backupContent += `-- Table structure for ${tableName}\n`;
          backupContent += `DROP TABLE IF EXISTS ${tableName};\n`;
          backupContent += `${schema};\n\n`;
        }

        // Data backup
        if (config.includeData) {
          const { data, count } = await this.getTableData(tableName);
          tableStats[tableName] = count;
          
          if (data.length > 0) {
            backupContent += `-- Data for table ${tableName}\n`;
            backupContent += `INSERT INTO ${tableName} VALUES\n`;
            backupContent += data.join(',\n');
            backupContent += ';\n\n';
          }
        }
      }

      // Write backup file
      if (config.compress) {
        const zlib = await import('zlib');
        const compressed = zlib.gzipSync(Buffer.from(backupContent));
        await fs.writeFile(backupPath, compressed);
      } else {
        await fs.writeFile(backupPath, backupContent);
      }

      // Get file size
      const stats = await fs.stat(backupPath);
      const duration = Date.now() - startTime;

      console.log(`Backup completed: ${backupPath} (${stats.size} bytes, ${duration}ms)`);

      return {
        backupPath,
        timestamp,
        sizeBytes: stats.size,
        tableStats,
        duration
      };

    } catch (error) {
      // Cleanup failed backup
      try {
        await fs.unlink(backupPath);
      } catch {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupPath: string): Promise<void> {
    try {
      let backupContent: string;

      // Check if file is compressed
      if (backupPath.endsWith('.gz')) {
        const zlib = await import('zlib');
        const compressed = await fs.readFile(backupPath);
        backupContent = zlib.gunzipSync(compressed).toString();
      } else {
        backupContent = await fs.readFile(backupPath, 'utf8');
      }

      // Split into individual statements
      const statements = backupContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      console.log(`Executing ${statements.length} SQL statements from backup`);

      await this.withConnection(async (conn) => {
        // Use a transaction for restore for consistency
        await conn.beginTransaction();
        try {
          for (const statement of statements) {
            if (statement.trim()) {
              await conn.execute(statement);
            }
          }
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw err;
        }
      });

      console.log('Database restore completed successfully');

    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw new Error(`Backup restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear all data from the database
   */
  async clearDatabase(excludeTables: string[] = []): Promise<number> {
    const tables = await this.getTables();
    const tablesToClear = tables.filter(table => !excludeTables.includes(table));
    
    let clearedTables = 0;

    await this.withConnection(async (conn) => {
      for (const tableName of tablesToClear) {
        try {
          await conn.execute(`DELETE FROM ${tableName}`);
          console.log(`Cleared table: ${tableName}`);
          clearedTables++;
        } catch (error) {
          console.error(`Failed to clear table ${tableName}:`, error);
        }
      }

      // Reset SQLite sequence counters
      try {
        await conn.execute('DELETE FROM sqlite_sequence');
        console.log('Reset auto-increment sequences');
      } catch (error) {
        console.warn('Failed to reset sequences (may not be SQLite):', error);
      }
    });

    return clearedTables;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    tables: Array<{ name: string; rowCount: number; sizeEstimate: string }>;
    totalRows: number;
  }> {
    const tables = await this.getTables();
    const tableStats: Array<{ name: string; rowCount: number; sizeEstimate: string }> = [];
    let totalRows = 0;

    await this.withConnection(async (conn) => {
      for (const tableName of tables) {
        const countResult = await conn.query<{ count: number | string }>(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = Number(countResult.rows[0]?.count ?? 0);
        totalRows += count;
        tableStats.push({
          name: tableName,
          rowCount: count,
          sizeEstimate: this.formatBytes(count * 1024) // Rough estimate
        });
      }
    });

    return {
      tables: tableStats,
      totalRows
    };
  }

  /**
   * List available backups in backup directory
   */
  async listBackups(backupDir = './backups'): Promise<Array<{
    filename: string;
    path: string;
    size: number;
    created: Date;
    compressed: boolean;
  }>> {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(f => 
        f.startsWith('alb_logs_backup') && (f.endsWith('.sql') || f.endsWith('.sql.gz'))
      );

      const backups = [];

      for (const filename of backupFiles) {
        const filePath = path.join(backupDir, filename);
        const stats = await fs.stat(filePath);
        
        backups.push({
          filename,
          path: filePath,
          size: stats.size,
          created: stats.mtime,
          compressed: filename.endsWith('.gz')
        });
      }

      // Sort by creation date (newest first)
      return backups.sort((a, b) => b.created.getTime() - a.created.getTime());

    } catch (error) {
      console.warn('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Delete old backups (keep only specified number)
   */
  async cleanupBackups(backupDir = './backups', keepCount = 5): Promise<number> {
    const backups = await this.listBackups(backupDir);
    const backupsToDelete = backups.slice(keepCount);
    
    let deletedCount = 0;

    for (const backup of backupsToDelete) {
      try {
        await fs.unlink(backup.path);
        console.log(`Deleted old backup: ${backup.filename}`);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete backup ${backup.filename}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Get list of tables in the database
   */
  private async getTables(): Promise<string[]> {
    let query: string;
    
    if (this.databaseType === 'postgresql') {
      // PostgreSQL query for getting tables
      query = `
        SELECT tablename as name 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY tablename
      `;
    } else {
      // SQLite query
      query = `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `;
    }
    
    const result = await this.withConnection(conn => conn.query<{ name: string }>(query));
    return result.rows.map(row => row.name).filter(Boolean);
  }

  /**
   * Get table schema
   */
  private async getTableSchema(tableName: string): Promise<string> {
    if (this.databaseType === 'postgresql') {
      // For PostgreSQL, we'll construct a CREATE TABLE statement from column info
      const result = await this.withConnection(conn => conn.query<any>(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
        `,
        [tableName]
      ));
      
      if (result.rows.length === 0) return '';
      
      const columns = result.rows.map(col => 
        `${col.column_name} ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`
      ).join(',\n  ');
      
      return `CREATE TABLE ${tableName} (\n  ${columns}\n);`;
    } else {
      // SQLite query
      const result = await this.withConnection(conn => conn.query<{ sql: string }>(
        `
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name=?
        `,
        [tableName]
      ));
      return result.rows[0]?.sql || '';
    }
  }

  /**
   * Get table data as INSERT statements
   */
  private async getTableData(tableName: string): Promise<{ data: string[]; count: number }> {
    const result = await this.withConnection(conn => conn.query<any>(`SELECT * FROM ${tableName}`));
    const rows = result.rows || [];

    if (rows.length === 0) {
      return { data: [], count: 0 };
    }

    // Get column names
    const columns = Object.keys(rows[0]);
    
    const data = rows.map(row => {
      const values = columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') {
          return `'${value.replace(/'/g, "''")}'`; // Escape quotes
        }
        return value.toString();
      });
      
      return `(${values.join(', ')})`;
    });

    return { data, count: rows.length };
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}