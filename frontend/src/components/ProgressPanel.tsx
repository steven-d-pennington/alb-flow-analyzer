import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Collapse,
  Badge,
  Switch,
  FormControlLabel,
  Divider,
  Button
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Clear as ClearIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useWebSocket } from '../hooks/useWebSocket';
import { ProgressNotification } from './ProgressNotification';

interface ProgressPanelProps {
  position?: 'fixed' | 'relative';
  maxHeight?: number;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  position = 'fixed',
  maxHeight = 400
}) => {
  const {
    isConnected,
    progressUpdates,
    connectionError,
    clearProgressUpdates
  } = useWebSocket();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(new Set());

  const visibleUpdates = progressUpdates.filter(update => 
    !dismissedUpdates.has(`${update.timestamp}-${update.operation}`)
  );

  const activeUpdates = visibleUpdates.filter(update => 
    update.type === 'progress' || 
    (update.type === 'status' && !update.message?.includes('Connected'))
  );

  const handleDismissUpdate = (update: any) => {
    const key = `${update.timestamp}-${update.operation}`;
    setDismissedUpdates(prev => new Set([...prev, key]));
  };

  const handleClearAll = () => {
    clearProgressUpdates();
    setDismissedUpdates(new Set());
  };

  const getConnectionStatus = () => {
    if (connectionError) return { color: 'error', text: 'Connection Error' };
    if (isConnected) return { color: 'success', text: 'Connected' };
    return { color: 'warning', text: 'Connecting...' };
  };

  const status = getConnectionStatus();

  if (position === 'fixed') {
    return (
      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          width: 400,
          maxWidth: 'calc(100vw - 32px)',
          zIndex: 1300,
          overflow: 'hidden'
        }}
      >
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            bgcolor: 'background.paper'
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <Badge badgeContent={activeUpdates.length} color="primary">
              <NotificationsIcon color={status.color as any} />
            </Badge>
            <Typography variant="subtitle2">
              Progress Updates
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ({status.text})
            </Typography>
          </Box>
          
          <IconButton size="small">
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        <Collapse in={isExpanded}>
          <Divider />
          
          <Box sx={{ p: 2, pt: 1 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={showDetails}
                    onChange={(e) => setShowDetails(e.target.checked)}
                    size="small"
                  />
                }
                label="Show Details"
                sx={{ fontSize: '0.75rem' }}
              />
              
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={handleClearAll}
                disabled={visibleUpdates.length === 0}
              >
                Clear All
              </Button>
            </Box>

            <Box
              sx={{
                maxHeight: maxHeight - 120,
                overflowY: 'auto',
                '&::-webkit-scrollbar': {
                  width: 6,
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 3,
                },
              }}
            >
              {visibleUpdates.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                  No progress updates
                </Typography>
              ) : (
                visibleUpdates
                  .slice()
                  .reverse() // Show newest first
                  .map((update, index) => (
                    <ProgressNotification
                      key={`${update.timestamp}-${update.operation}-${index}`}
                      update={update}
                      onClose={() => handleDismissUpdate(update)}
                      showDetails={showDetails}
                    />
                  ))
              )}
            </Box>
          </Box>
        </Collapse>
      </Paper>
    );
  }

  // Relative positioning for embedding in other components
  return (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          Real-time Progress
        </Typography>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color={`${status.color}.main`}>
            {status.text}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={showDetails}
                onChange={(e) => setShowDetails(e.target.checked)}
                size="small"
              />
            }
            label="Details"
          />
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={handleClearAll}
            disabled={visibleUpdates.length === 0}
          >
            Clear
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          maxHeight: maxHeight,
          overflowY: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 1
        }}
      >
        {visibleUpdates.length === 0 ? (
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
            No progress updates
          </Typography>
        ) : (
          visibleUpdates
            .slice()
            .reverse() // Show newest first
            .map((update, index) => (
              <ProgressNotification
                key={`${update.timestamp}-${update.operation}-${index}`}
                update={update}
                onClose={() => handleDismissUpdate(update)}
                showDetails={showDetails}
              />
            ))
        )}
      </Box>
    </Box>
  );
};