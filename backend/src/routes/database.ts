import { Router, Request, Response } from 'express';
import { BackupService } from '../database/BackupService';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { getDatabaseConfig } from '../config/database';

const router = Router();

// Initialize backup service
let backupService: BackupService | null = null;

const initializeBackupService = async () => {
  if (!backupService) {
    const config = getDatabaseConfig();
    const factory = ConnectionFactory.getInstance();
    const connection = await factory.createPool(config);
    backupService = new BackupService(connection);
  }
  return backupService;
};

/**
 * POST /api/database/backup
 * Create a database backup
 */
router.post('/backup', async (req: Request, res: Response) => {
  try {
    const service = await initializeBackupService();
    const { 
      backupDir,
      includeSchema = true,
      includeData = true,
      compress = false,
      timestampSuffix = true
    } = req.body;

    const result = await service.createBackup({
      backupDir,
      includeSchema,
      includeData,
      compress,
      timestampSuffix
    });

    res.json({
      success: true,
      data: result,
      message: 'Database backup created successfully'
    });
  } catch (error) {
    console.error('Database backup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create database backup',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/database/restore
 * Restore database from backup
 */
router.post('/restore', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await initializeBackupService();
    const { backupPath } = req.body;

    if (!backupPath) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Backup path is required'
      });
      return;
    }

    await service.restoreBackup(backupPath);

    res.json({
      success: true,
      message: 'Database restored successfully'
    });
  } catch (error) {
    console.error('Database restore error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to restore database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/database/clear
 * Clear all data from the database
 */
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const service = await initializeBackupService();
    const { excludeTables = [] } = req.body;

    const clearedTables = await service.clearDatabase(excludeTables);

    res.json({
      success: true,
      data: {
        clearedTables,
        excludedTables: excludeTables
      },
      message: `Cleared ${clearedTables} tables from database`
    });
  } catch (error) {
    console.error('Database clear error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to clear database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/stats
 * Get database statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const service = await initializeBackupService();
    const stats = await service.getDatabaseStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get database statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/backups
 * List available backups
 */
router.get('/backups', async (req: Request, res: Response) => {
  try {
    const service = await initializeBackupService();
    const { backupDir = './backups' } = req.query;

    const backups = await service.listBackups(backupDir as string);

    res.json({
      success: true,
      data: backups,
      meta: {
        totalBackups: backups.length,
        backupDirectory: backupDir
      }
    });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list backups',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/database/backups/cleanup
 * Cleanup old backups
 */
router.delete('/backups/cleanup', async (req: Request, res: Response) => {
  try {
    const service = await initializeBackupService();
    const { 
      backupDir = './backups',
      keepCount = 5
    } = req.body;

    const deletedCount = await service.cleanupBackups(backupDir, keepCount);

    res.json({
      success: true,
      data: {
        deletedBackups: deletedCount,
        keepCount,
        backupDirectory: backupDir
      },
      message: `Cleaned up ${deletedCount} old backups`
    });
  } catch (error) {
    console.error('Cleanup backups error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cleanup backups',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;