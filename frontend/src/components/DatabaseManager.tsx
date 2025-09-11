import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Grid,
  CircularProgress,
} from '@mui/material';
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  DeleteForever as ClearIcon,
  Storage as DatabaseIcon,
} from '@mui/icons-material';
import { databaseService, DatabaseStats, BackupInfo, BackupOptions } from '../services/databaseService';
import { formatBytes, formatDate } from '../utils/formatters';

interface DatabaseManagerProps {
  onDatabaseCleared?: () => void;
}

const DatabaseManager: React.FC<DatabaseManagerProps> = ({ onDatabaseCleared }) => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  // Form states
  const [backupOptions, setBackupOptions] = useState<BackupOptions>({
    includeSchema: true,
    includeData: true,
    compress: false,
    timestampSuffix: true
  });
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [backupBeforeClear, setBackupBeforeClear] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, backupsData] = await Promise.all([
        databaseService.getDatabaseStats(),
        databaseService.listBackups(),
      ]);
      setStats(statsData);
      setBackups(backupsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      await databaseService.createBackup(backupOptions);
      setBackupDialogOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup');
      setLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      setLoading(true);
      
      // Create backup first if requested
      if (backupBeforeClear) {
        await databaseService.createBackup({
          includeSchema: true,
          includeData: true,
          compress: true,
          timestampSuffix: true
        });
      }

      // Clear database
      await databaseService.clearDatabase();
      setClearDialogOpen(false);
      
      // Notify parent component
      if (onDatabaseCleared) {
        onDatabaseCleared();
      }
      
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear database');
      setLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;

    try {
      setLoading(true);
      await databaseService.restoreBackup(selectedBackup);
      setRestoreDialogOpen(false);
      setSelectedBackup(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Box display="flex" alignItems="center" gap={1}>
            <DatabaseIcon color="primary" />
            <Typography variant="h6">Database Management</Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<BackupIcon />}
              onClick={() => setBackupDialogOpen(true)}
              disabled={loading}
            >
              Create Backup
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestoreIcon />}
              onClick={() => setRestoreDialogOpen(true)}
              disabled={loading || backups.length === 0}
            >
              Restore
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<ClearIcon />}
              onClick={() => setClearDialogOpen(true)}
              disabled={loading}
            >
              Clear Database
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Database Statistics */}
        {stats && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Database Statistics</Typography>
                <Typography variant="body2">
                  <strong>Total Tables:</strong> {stats.tables.length}
                </Typography>
                <Typography variant="body2">
                  <strong>Total Records:</strong> {stats.totalRows.toLocaleString()}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Available Backups</Typography>
                <Typography variant="body2">
                  <strong>Backup Count:</strong> {backups.length}
                </Typography>
                <Typography variant="body2">
                  <strong>Total Size:</strong> {formatBytes(backups.reduce((sum, b) => sum + b.size, 0))}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* Tables List */}
        {stats && stats.tables.length > 0 && (
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Table Name</TableCell>
                  <TableCell align="right">Records</TableCell>
                  <TableCell align="right">Estimated Size</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.tables.map((table) => (
                  <TableRow key={table.name}>
                    <TableCell>{table.name}</TableCell>
                    <TableCell align="right">{table.rowCount.toLocaleString()}</TableCell>
                    <TableCell align="right">{table.sizeEstimate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      {/* Create Backup Dialog */}
      <Dialog open={backupDialogOpen} onClose={() => setBackupDialogOpen(false)}>
        <DialogTitle>Create Database Backup</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={backupOptions.includeSchema}
                  onChange={(e) => setBackupOptions(prev => ({ ...prev, includeSchema: e.target.checked }))}
                />
              }
              label="Include Schema"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={backupOptions.includeData}
                  onChange={(e) => setBackupOptions(prev => ({ ...prev, includeData: e.target.checked }))}
                />
              }
              label="Include Data"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={backupOptions.compress}
                  onChange={(e) => setBackupOptions(prev => ({ ...prev, compress: e.target.checked }))}
                />
              }
              label="Compress Backup"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={backupOptions.timestampSuffix}
                  onChange={(e) => setBackupOptions(prev => ({ ...prev, timestampSuffix: e.target.checked }))}
                />
              }
              label="Add Timestamp to Filename"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackupDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateBackup} variant="contained" disabled={loading}>
            Create Backup
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Database Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Database</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Alert severity="warning">
              <strong>Warning:</strong> This will permanently delete all data from the database. This action cannot be undone.
            </Alert>
            <FormControlLabel
              control={
                <Checkbox
                  checked={backupBeforeClear}
                  onChange={(e) => setBackupBeforeClear(e.target.checked)}
                />
              }
              label="Create backup before clearing"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClearDatabase} color="error" variant="contained" disabled={loading}>
            Clear Database
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Backup Dialog */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
        <DialogTitle>Restore Database</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Select a backup to restore. This will replace all current database data.
          </Alert>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox"></TableCell>
                  <TableCell>Filename</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow
                    key={backup.path}
                    onClick={() => setSelectedBackup(backup.path)}
                    sx={{ cursor: 'pointer', backgroundColor: selectedBackup === backup.path ? 'action.selected' : 'inherit' }}
                  >
                    <TableCell padding="checkbox">
                      <input
                        type="radio"
                        checked={selectedBackup === backup.path}
                        onChange={() => setSelectedBackup(backup.path)}
                      />
                    </TableCell>
                    <TableCell>{backup.filename}</TableCell>
                    <TableCell>{formatDate(backup.created)}</TableCell>
                    <TableCell>{formatBytes(backup.size)}</TableCell>
                    <TableCell>
                      <Chip label={backup.compressed ? 'Compressed' : 'Uncompressed'} size="small" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleRestoreBackup} 
            color="primary" 
            variant="contained" 
            disabled={!selectedBackup || loading}
          >
            Restore Selected
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default DatabaseManager;