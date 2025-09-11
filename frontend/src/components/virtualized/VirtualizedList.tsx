import React, { useMemo, useCallback } from 'react';
import { List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import {
  Box,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Paper,
  Skeleton,
  Typography,
  styled,
  alpha,
  Divider,
} from '@mui/material';
import { useInView } from 'react-intersection-observer';

const VirtualizedContainer = styled(Paper)(({ theme }) => ({
  height: '100%',
  width: '100%',
  '& .virtualized-list-item': {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&.selected': {
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
    },
    '&:last-child': {
      borderBottom: 'none',
    },
  },
}));

interface VirtualizedListProps<T = any> {
  items: T[];
  height?: number;
  itemSize?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  renderSkeleton?: () => React.ReactNode;
  onItemClick?: (item: T, index: number) => void;
  selectedItemIndex?: number;
  loading?: boolean;
  hasNextPage?: boolean;
  loadNextPage?: () => Promise<void> | void;
  error?: string | null;
  emptyMessage?: string;
  loadingItemCount?: number;
  overscan?: number;
  className?: string;
}

interface ListItemRendererProps<T> {
  index: number;
  style: React.CSSProperties;
  data: {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    renderSkeleton?: () => React.ReactNode;
    onItemClick?: (item: T, index: number) => void;
    selectedItemIndex?: number;
    loading?: boolean;
    loadingItemCount?: number;
  };
}

function ListItemRenderer<T>({ index, style, data }: ListItemRendererProps<T>) {
  const {
    items,
    renderItem,
    renderSkeleton,
    onItemClick,
    selectedItemIndex,
    loading,
    loadingItemCount = 10,
  } = data;

  const isLoadingItem = loading && index >= items.length;
  const isSelected = selectedItemIndex === index;

  // Show loading skeleton if we're beyond the actual items
  if (isLoadingItem && index < items.length + loadingItemCount) {
    return (
      <div style={style} className="virtualized-list-item">
        {renderSkeleton ? renderSkeleton() : (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Skeleton variant="circular" width={40} height={40} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
            </Box>
            <Skeleton variant="rectangular" width={60} height={20} />
          </Box>
        )}
      </div>
    );
  }

  if (index >= items.length) {
    return null;
  }

  const item = items[index];

  const handleClick = () => {
    if (onItemClick) {
      onItemClick(item, index);
    }
  };

  return (
    <div
      style={style}
      className={`virtualized-list-item ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      role="listitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {renderItem(item, index)}
    </div>
  );
}

export function VirtualizedList<T = any>({
  items,
  height = 400,
  itemSize = 72,
  renderItem,
  renderSkeleton,
  onItemClick,
  selectedItemIndex,
  loading = false,
  hasNextPage = false,
  loadNextPage,
  error,
  emptyMessage = 'No items to display',
  loadingItemCount = 10,
  overscan = 5,
  className,
}: VirtualizedListProps<T>) {
  // Calculate total item count including loading placeholders
  const itemCount = useMemo(() => {
    if (loading && hasNextPage) {
      return items.length + loadingItemCount;
    }
    return items.length;
  }, [items.length, loading, hasNextPage, loadingItemCount]);

  const isItemLoaded = useCallback(
    (index: number) => {
      return !!items[index];
    },
    [items]
  );

  const itemData = useMemo(() => ({
    items,
    renderItem,
    renderSkeleton,
    onItemClick,
    selectedItemIndex,
    loading,
    loadingItemCount,
  }), [items, renderItem, renderSkeleton, onItemClick, selectedItemIndex, loading, loadingItemCount]);

  if (error) {
    return (
      <VirtualizedContainer className={className}>
        <Box p={3} textAlign="center">
          <Typography color="error" variant="h6">
            Error loading items
          </Typography>
          <Typography color="textSecondary">
            {error}
          </Typography>
        </Box>
      </VirtualizedContainer>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <VirtualizedContainer className={className}>
        <Box p={3} textAlign="center">
          <Typography color="textSecondary" variant="body1">
            {emptyMessage}
          </Typography>
        </Box>
      </VirtualizedContainer>
    );
  }

  if (loadNextPage && hasNextPage) {
    return (
      <VirtualizedContainer className={className}>
        <InfiniteLoader
          isItemLoaded={isItemLoaded}
          itemCount={itemCount}
          loadMoreItems={loadNextPage}
        >
          {({ onItemsRendered, ref }) => (
            <List
              ref={ref}
              height={height}
              itemCount={itemCount}
              itemSize={itemSize}
              itemData={itemData}
              onItemsRendered={onItemsRendered}
              overscanCount={overscan}
            >
              {ListItemRenderer}
            </List>
          )}
        </InfiniteLoader>
      </VirtualizedContainer>
    );
  }

  return (
    <VirtualizedContainer className={className}>
      <List
        height={height}
        itemCount={itemCount}
        itemSize={itemSize}
        itemData={itemData}
        overscanCount={overscan}
      >
        {ListItemRenderer}
      </List>
    </VirtualizedContainer>
  );
}

// Convenience components for common use cases
export interface SessionItemProps {
  sessionId: string;
  clientIp: string;
  duration: number;
  requestCount: number;
  errorCount: number;
  timestamp: Date;
  selected?: boolean;
  onClick?: () => void;
}

export const SessionListItem: React.FC<SessionItemProps> = ({
  sessionId,
  clientIp,
  duration,
  requestCount,
  errorCount,
  timestamp,
  selected = false,
  onClick,
}) => {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <ListItem
      button
      selected={selected}
      onClick={onClick}
      sx={{ width: '100%', p: 0 }}
    >
      <ListItemText
        primary={
          <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
            {sessionId}
          </Typography>
        }
        secondary={
          <Box>
            <Typography variant="body2" color="textSecondary">
              {clientIp} • {new Date(timestamp).toLocaleString()}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {requestCount} requests • {formatDuration(duration)}
              {errorCount > 0 && ` • ${errorCount} errors`}
            </Typography>
          </Box>
        }
      />
    </ListItem>
  );
};

export default VirtualizedList;