import React, { useMemo, forwardRef, useCallback } from 'react';
import { List } from 'react-window';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  Skeleton,
  styled,
  alpha,
} from '@mui/material';
import { useInView } from 'react-intersection-observer';

const VirtualizedContainer = styled(Paper)(({ theme }) => ({
  height: '100%',
  width: '100%',
  '& .virtualized-table-header': {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  '& .virtualized-table-row': {
    display: 'flex',
    alignItems: 'center',
    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&.selected': {
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
    },
  },
  '& .virtualized-table-cell': {
    flex: 1,
    padding: theme.spacing(1, 2),
    display: 'flex',
    alignItems: 'center',
    minHeight: 48,
  },
}));

export interface ColumnDef<T = any> {
  key: string;
  header: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  resizable?: boolean;
}

interface VirtualizedTableProps<T = any> {
  data: T[];
  columns: ColumnDef<T>[];
  height?: number;
  itemSize?: number;
  loading?: boolean;
  error?: string | null;
  onRowClick?: (row: T, index: number) => void;
  selectedRowIndex?: number;
  onLoadMore?: () => void;
  hasNextPage?: boolean;
  overscan?: number;
  className?: string;
  emptyMessage?: string;
  loadingRowCount?: number;
}

interface RowRendererProps {
  index: number;
  style: React.CSSProperties;
  data: {
    items: any[];
    columns: ColumnDef[];
    onRowClick?: (row: any, index: number) => void;
    selectedRowIndex?: number;
    loading?: boolean;
    loadingRowCount?: number;
  };
}

const RowRenderer: React.FC<RowRendererProps> = ({ index, style, data }) => {
  const { items, columns, onRowClick, selectedRowIndex, loading, loadingRowCount = 10 } = data || {};
  
  // Defensive data handling
  const safeItems = Array.isArray(items) ? items : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  
  // Show loading skeletons if we're loading and don't have enough data
  const isLoadingRow = loading && index >= safeItems.length;
  const isSelected = selectedRowIndex === index;
  
  if (isLoadingRow && index < loadingRowCount) {
    return (
      <div style={style} className="virtualized-table-row">
        {safeColumns.map((column, colIndex) => (
          <div
            key={column.key || colIndex}
            className="virtualized-table-cell"
            style={{
              width: column.width || `${100 / safeColumns.length}%`,
              minWidth: column.minWidth,
              maxWidth: column.maxWidth,
            }}
          >
            <Skeleton variant="text" width="80%" />
          </div>
        ))}
      </div>
    );
  }
  
  if (index >= safeItems.length) {
    return null;
  }
  
  const row = safeItems[index];
  
  const handleRowClick = () => {
    if (onRowClick) {
      onRowClick(row, index);
    }
  };
  
  return (
    <div
      style={style}
      className={`virtualized-table-row ${isSelected ? 'selected' : ''}`}
      onClick={handleRowClick}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
    >
      {safeColumns.map((column, colIndex) => {
        const value = row && column.key ? row[column.key] : '';
        const cellContent = column.render ? column.render(value, row, index) : value;
        
        return (
          <div
            key={column.key || colIndex}
            className="virtualized-table-cell"
            style={{
              width: column.width || `${100 / safeColumns.length}%`,
              minWidth: column.minWidth,
              maxWidth: column.maxWidth,
              textAlign: column.align || 'left',
            }}
          >
            {cellContent}
          </div>
        );
      })}
    </div>
  );
};

export function VirtualizedTable<T = any>({
  data,
  columns,
  height = 400,
  itemSize = 48,
  loading = false,
  error,
  onRowClick,
  selectedRowIndex,
  onLoadMore,
  hasNextPage = false,
  overscan = 5,
  className,
  emptyMessage = 'No data available',
  loadingRowCount = 10,
}: VirtualizedTableProps<T>) {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });
  
  // Defensive data handling
  const safeData = Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  
  // Trigger load more when the sentinel comes into view
  React.useEffect(() => {
    if (inView && onLoadMore && hasNextPage && !loading) {
      onLoadMore();
    }
  }, [inView, onLoadMore, hasNextPage, loading]);
  
  // Calculate total item count including loading placeholders
  const totalItemCount = useMemo(() => {
    let count = safeData.length;
    if (loading && hasNextPage) {
      count += loadingRowCount;
    }
    return count;
  }, [safeData.length, loading, hasNextPage, loadingRowCount]);
  
  const rowData = useMemo(() => ({
    items: safeData,
    columns: safeColumns,
    onRowClick,
    selectedRowIndex,
    loading,
    loadingRowCount,
  }), [safeData, safeColumns, onRowClick, selectedRowIndex, loading, loadingRowCount]);
  
  if (error) {
    return (
      <VirtualizedContainer className={className}>
        <Box p={3} textAlign="center">
          <Typography color="error" variant="h6">
            Error loading data
          </Typography>
          <Typography color="textSecondary">
            {error}
          </Typography>
        </Box>
      </VirtualizedContainer>
    );
  }
  
  if (!loading && safeData.length === 0) {
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
  
  return (
    <VirtualizedContainer className={className}>
      {/* Table Header */}
      {safeColumns.length > 0 && (
        <div className="virtualized-table-header">
          <div className="virtualized-table-row">
            {safeColumns.map((column) => (
              <div
                key={column.key}
                className="virtualized-table-cell"
                style={{
                  width: column.width || `${100 / safeColumns.length}%`,
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                  textAlign: column.align || 'left',
                  fontWeight: 600,
                }}
              >
                <Typography variant="subtitle2" noWrap>
                  {column.header}
                </Typography>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Virtualized Table Body */}
      <Box sx={{ height: height - (safeColumns.length > 0 ? 48 : 0) }}>
        {totalItemCount > 0 && safeColumns.length > 0 && (
          <List
            height={height - (safeColumns.length > 0 ? 48 : 0)}
            itemCount={totalItemCount}
            itemSize={itemSize}
            itemData={rowData}
            overscanCount={overscan}
            width="100%"
          >
            {RowRenderer}
          </List>
        )}
        {(totalItemCount === 0 || safeColumns.length === 0) && !loading && (
          <Box p={3} textAlign="center">
            <Typography color="textSecondary">
              {safeColumns.length === 0 ? 'No columns configured' : 'No data to display'}
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* Infinite loading sentinel */}
      {hasNextPage && (
        <div ref={ref} style={{ height: 1, visibility: 'hidden' }} />
      )}
    </VirtualizedContainer>
  );
}

export default VirtualizedTable;