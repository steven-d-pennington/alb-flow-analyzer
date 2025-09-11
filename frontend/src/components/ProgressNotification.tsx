import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  LinearProgress,
  Typography,
  Collapse,
  IconButton,
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { ProgressUpdate } from '../hooks/useWebSocket';

interface ProgressNotificationProps {
  update: ProgressUpdate;
  onClose?: () => void;
  showDetails?: boolean;
}

export const ProgressNotification: React.FC<ProgressNotificationProps> = ({
  update,
  onClose,
  showDetails = false
}) => {
  const getSeverity = () => {
    switch (update.type) {
      case 'error':
        return 'error';
      case 'complete':
        return 'success';
      case 'progress':
        return 'info';
      case 'status':
      default:
        return 'info';
    }
  };

  const getIcon = () => {
    switch (update.type) {
      case 'error':
        return <ErrorIcon />;
      case 'complete':
        return <CheckCircleIcon />;
      case 'progress':
      case 'status':
      default:
        return <InfoIcon />;
    }
  };

  const formatOperation = (operation: string) => {
    return operation
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  return (
    <Alert
      severity={getSeverity()}
      icon={getIcon()}
      action={
        onClose && (
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={onClose}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        )
      }
      sx={{ mb: 1 }}
    >
      <AlertTitle>
        <Box display="flex" alignItems="center" gap={1}>
          {formatOperation(update.operation)}
          <Chip
            label={formatTimestamp(update.timestamp)}
            size="small"
            variant="outlined"
          />
        </Box>
      </AlertTitle>
      
      <Typography variant="body2" sx={{ mb: 1 }}>
        {update.message}
      </Typography>

      {update.type === 'progress' && typeof update.progress === 'number' && (
        <Box sx={{ mb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Progress
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {update.progress.toFixed(1)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={update.progress}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      <Collapse in={showDetails && !!update.data}>
        <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Details:
          </Typography>
          
          {update.data && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {update.data.processedFiles !== undefined && update.data.totalFiles !== undefined && (
                <Chip
                  label={`Files: ${update.data.processedFiles}/${update.data.totalFiles}`}
                  size="small"
                  variant="outlined"
                />
              )}
              
              {update.data.processedEntries !== undefined && (
                <Chip
                  label={`Entries: ${update.data.processedEntries.toLocaleString()}`}
                  size="small"
                  variant="outlined"
                />
              )}
              
              {update.data.processedBytes !== undefined && (
                <Chip
                  label={`Processed: ${formatBytes(update.data.processedBytes)}`}
                  size="small"
                  variant="outlined"
                />
              )}
              
              {update.data.totalBytes !== undefined && update.data.processedBytes !== undefined && (
                <Chip
                  label={`Total: ${formatBytes(update.data.totalBytes)}`}
                  size="small"
                  variant="outlined"
                />
              )}
              
              {update.data.estimatedTimeRemaining !== undefined && update.data.estimatedTimeRemaining > 0 && (
                <Chip
                  label={`ETA: ${formatTime(update.data.estimatedTimeRemaining)}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              )}
              
              {update.data.currentFile && (
                <Chip
                  label={`File: ${update.data.currentFile}`}
                  size="small"
                  variant="outlined"
                  sx={{ maxWidth: 200 }}
                />
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Alert>
  );
};