const API_BASE_URL = 'http://localhost:3001/api';

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

export interface DatabaseStats {
  tables: Array<{ name: string; rowCount: number; sizeEstimate: string }>;
  totalRows: number;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  compressed: boolean;
}

export class DatabaseService {
  /**
   * Create a database backup
   */
  async createBackup(options: BackupOptions = {}): Promise<BackupResult> {
    const response = await fetch(`${API_BASE_URL}/database/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to create backup');
    }

    const result = await response.json();
    return {
      ...result.data,
      timestamp: new Date(result.data.timestamp)
    };
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupPath: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/database/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ backupPath }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to restore backup');
    }
  }

  /**
   * Clear all data from the database
   */
  async clearDatabase(excludeTables: string[] = []): Promise<{
    clearedTables: number;
    excludedTables: string[];
  }> {
    const response = await fetch(`${API_BASE_URL}/database/clear`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ excludeTables }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to clear database');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    const response = await fetch(`${API_BASE_URL}/database/stats`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to get database statistics');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * List available backups
   */
  async listBackups(backupDir: string = './backups'): Promise<BackupInfo[]> {
    const url = new URL(`${API_BASE_URL}/database/backups`);
    url.searchParams.append('backupDir', backupDir);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to list backups');
    }

    const result = await response.json();
    return result.data.map((backup: any) => ({
      ...backup,
      created: new Date(backup.created)
    }));
  }

  /**
   * Cleanup old backups
   */
  async cleanupBackups(backupDir: string = './backups', keepCount: number = 5): Promise<{
    deletedBackups: number;
    keepCount: number;
    backupDirectory: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/database/backups/cleanup`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ backupDir, keepCount }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Failed to cleanup backups');
    }

    const result = await response.json();
    return result.data;
  }
}

// Create singleton instance
export const databaseService = new DatabaseService();