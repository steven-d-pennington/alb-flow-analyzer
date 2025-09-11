import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Grid,
  FormControlLabel,
  Checkbox,
  TextField,
  CircularProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  CleaningServices as CleanupIcon,
  PlayArrow as PlayArrowIcon,
  Replay as ReplayIcon,
} from '@mui/icons-material';
import { downloadService } from '../services/downloadService';
import { processingService } from '../services/processingService';
import { BatchSummary } from '../types/index';
import { formatBytes, formatDate } from '../utils/formatters';
import DatabaseManager from '../components/DatabaseManager';

const LocalFilesPage: React.FC = () => {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(7);
  const [backupBeforeCleanup, setBackupBeforeCleanup] = useState(true);
  const [processingBatches, setProcessingBatches] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  const loadData = async (isRetry = false) => {
    try {
      setLoading(true);
      console.log('LocalFilesPage: Loading batches and stats...');
      
      // Load sequentially to reduce concurrent requests
      const batchesData = await downloadService.getBatches();
      console.log('LocalFilesPage: Received batches:', batchesData);
      
      // Add a small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const statsData = await downloadService.getStats();
      console.log('LocalFilesPage: Received stats:', statsData);
      
      setBatches(batchesData);
      setStats(statsData);
      setError(null);
      setRetryCount(0); // Reset retry count on success
      
    } catch (err: any) {
      console.error('LocalFilesPage: Error loading data:', err);
      
      // Handle rate limiting with exponential backoff
      if (err.message?.includes('429') || err.response?.status === 429) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds
        setError(`Rate limited. Retrying in ${backoffDelay / 1000} seconds...`);
        
        if (retryCount < 3) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            loadData(true);
          }, backoffDelay);
          return;
        } else {
          setError('Too many requests. Please wait a moment and refresh manually.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // Refresh every 15 seconds to avoid rate limits
    return () => clearInterval(interval);
  }, []);

  const handleSelectBatch = (batchId: string) => {
    setSelectedBatches(prev =>
      prev.includes(batchId)
        ? prev.filter(id => id !== batchId)
        : [...prev, batchId]
    );
  };

  const handleSelectAll = () => {
    if (selectedBatches.length === batches.length) {
      setSelectedBatches([]);
    } else {
      setSelectedBatches(batches.map(b => b.batchId));
    }
  };

  const handleCancelDownload = async (batchId: string) => {
    try {
      await downloadService.cancelDownload(batchId);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel download');
    }
  };

  const handleProcessBatch = async (batchId: string) => {
    try {
      setProcessingBatches(prev => [...prev, batchId]);
      await processingService.processBatch({
        batchId,
        deleteAfterProcessing: false
      });
      setError(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process batch');
    } finally {
      setProcessingBatches(prev => prev.filter(id => id !== batchId));
    }
  };

  const handleReprocessBatch = async (batchId: string) => {
    try {
      setProcessingBatches(prev => [...prev, batchId]);
      await processingService.processBatch({
        batchId,
        deleteAfterProcessing: false,
        forceReprocess: true // Flag to indicate this is a reprocess
      });
      setError(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-process batch');
    } finally {
      setProcessingBatches(prev => prev.filter(id => id !== batchId));
    }
  };

  const handleDeleteBatches = async () => {
    try {
      await Promise.all(
        selectedBatches.map(batchId => downloadService.deleteBatch(batchId, true))
      );
      setSelectedBatches([]);
      setDeleteDialogOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete batches');
    }
  };

  const handleCleanup = async () => {
    try {
      // TODO: Implement backup functionality when ready
      if (backupBeforeCleanup) {
        // Placeholder for backup functionality
        console.log('Backup functionality will be implemented');
      }
      
      const result = await downloadService.cleanupOldBatches(cleanupDays);
      setCleanupDialogOpen(false);
      setError(null);
      loadData();
      // Show success message
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup batches');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'downloading': return 'primary';
      case 'pending': return 'default';
      case 'error': return 'error';
      case 'cancelled': return 'warning';
      default: return 'default';
    }
  };

  if (loading && !stats) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Local Files Management
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Local Files Management</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<CleanupIcon />}
            onClick={() => setCleanupDialogOpen(true)}
          >
            Cleanup Old Files
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StorageIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalBatches}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Batches
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DownloadIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalFiles}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Files
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6">{formatBytes(stats.totalSizeBytes)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Size
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6">{stats.activeDownloads}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Active Downloads
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Database Management */}
      <DatabaseManager onDatabaseCleared={loadData} />

      {/* Batches Table */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Download Batches</Typography>
            {selectedBatches.length > 0 && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete Selected ({selectedBatches.length})
              </Button>
            )}
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedBatches.length === batches.length && batches.length > 0}
                      indeterminate={selectedBatches.length > 0 && selectedBatches.length < batches.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Batch Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Files</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Download Date</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batches.map((batch, index) => (
                  <TableRow key={batch.batchId || `batch-${index}`}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={batch.batchId ? selectedBatches.includes(batch.batchId) : false}
                        onChange={() => batch.batchId && handleSelectBatch(batch.batchId)}
                        disabled={!batch.batchId}
                      />
                    </TableCell>
                    <TableCell>{batch.batchName || 'Unknown'}</TableCell>
                    <TableCell>
                      <Chip
                        label={batch.status || 'unknown'}
                        color={getStatusColor(batch.status || 'unknown') as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{batch.fileCount || 0}</TableCell>
                    <TableCell>{formatBytes(batch.totalSizeBytes || 0)}</TableCell>
                    <TableCell>{formatDate(batch.downloadDate)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {batch.status === 'completed' && batch.processingStatus === 'not_processed' && (
                          <Tooltip title="Process Batch">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleProcessBatch(batch.batchId)}
                              disabled={processingBatches.includes(batch.batchId)}
                            >
                              {processingBatches.includes(batch.batchId) ? (
                                <CircularProgress size={20} />
                              ) : (
                                <PlayArrowIcon />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                        {(
                          (batch.status === 'completed' && (batch.processingStatus === 'processed' || batch.processingStatus === 'error')) ||
                          batch.status === 'processed' ||
                          batch.status === 'error'
                        ) && (
                          <Tooltip title="Re-process Batch">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleReprocessBatch(batch.batchId)}
                              disabled={processingBatches.includes(batch.batchId)}
                            >
                              {processingBatches.includes(batch.batchId) ? (
                                <CircularProgress size={20} />
                              ) : (
                                <ReplayIcon />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                        {batch.status === 'downloading' && (
                          <Tooltip title="Cancel Download">
                            <IconButton
                              size="small"
                              onClick={() => handleCancelDownload(batch.batchId)}
                            >
                              <CancelIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete Batch">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedBatches([batch.batchId]);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No download batches found
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Batches</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {selectedBatches.length} batch(es)? 
            This will remove both the database records and local files.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteBatches} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cleanup Dialog */}
      <Dialog open={cleanupDialogOpen} onClose={() => setCleanupDialogOpen(false)}>
        <DialogTitle>Cleanup Old Batches</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              type="number"
              label="Delete batches older than (days)"
              value={cleanupDays}
              onChange={(e) => setCleanupDays(Number(e.target.value))}
              inputProps={{ min: 1 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={backupBeforeCleanup}
                  onChange={(e) => setBackupBeforeCleanup(e.target.checked)}
                />
              }
              label="Backup database before cleanup"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCleanup} color="primary" variant="contained">
            Cleanup
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LocalFilesPage;