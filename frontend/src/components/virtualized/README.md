# Virtualized Components

This directory contains optimized components for handling large datasets in the ALB Flow Analyzer frontend.

## Components

### VirtualizedTable

A high-performance table component that can handle millions of rows without performance degradation.

**Features:**
- Virtualized rendering using react-window
- Configurable column widths and alignment
- Custom cell renderers
- Row selection support
- Infinite scrolling with pagination
- Loading states and error handling
- Keyboard navigation support

**Usage:**
```tsx
import { VirtualizedTable, type ColumnDef } from './virtualized';

const columns: ColumnDef[] = [
  { key: 'id', header: 'ID', width: '10%' },
  { key: 'name', header: 'Name', width: '30%' },
  { 
    key: 'value', 
    header: 'Value', 
    width: '20%',
    render: (value) => value.toLocaleString()
  }
];

<VirtualizedTable
  data={largeDataset}
  columns={columns}
  height={500}
  onRowClick={(row, index) => console.log('Clicked:', row)}
  hasNextPage={hasMore}
  onLoadMore={loadMore}
/>
```

### VirtualizedList

A performant list component for displaying large numbers of items.

**Features:**
- Virtualized rendering with react-window
- Infinite scrolling support
- Custom item renderers
- Loading skeletons
- Item selection
- Optimized for mobile devices

**Usage:**
```tsx
import { VirtualizedList, SessionListItem } from './virtualized';

const renderSession = (session, index) => (
  <SessionListItem
    sessionId={session.sessionId}
    clientIp={session.clientIp}
    duration={session.duration}
    requestCount={session.totalRequests}
    errorCount={session.errorCount}
    timestamp={session.startTime}
    onClick={() => handleSessionClick(session)}
  />
);

<VirtualizedList
  items={sessions}
  height={600}
  renderItem={renderSession}
  hasNextPage={hasNextPage}
  loadNextPage={loadNextPage}
/>
```

### SkeletonLoader

Provides loading states for better user experience during data fetching.

**Features:**
- Multiple skeleton variants (card, list, table, chart, dashboard)
- Animated loading states
- Configurable dimensions
- Custom skeleton layouts

**Usage:**
```tsx
import { 
  SkeletonLoader, 
  DashboardSkeleton, 
  TableSkeleton,
  MetricCardSkeleton 
} from './virtualized';

// While loading dashboard
<DashboardSkeleton height={800} />

// While loading table
<TableSkeleton rows={10} columns={5} />

// Custom skeleton
<SkeletonLoader variant="custom">
  <MetricCardSkeleton />
</SkeletonLoader>
```

## Hooks

### usePagination

Handles pagination logic for large datasets with support for both traditional pagination and infinite scrolling.

**Features:**
- Traditional pagination support
- Infinite scroll mode
- Data caching with React Query
- Progress tracking
- Error handling

**Usage:**
```tsx
import { usePagination, useInfinitePagination } from '../hooks/usePagination';

// Traditional pagination
const {
  data,
  currentPage,
  totalPages,
  isLoading,
  setPage,
  setPageSize
} = usePagination(['sessions'], fetchSessions);

// Infinite scrolling
const {
  allData,
  hasNext,
  loadMore,
  isLoadingMore
} = useInfinitePagination(['sessions'], fetchSessions, 50);
```

### usePerformance

Monitors component performance and provides optimization insights.

**Features:**
- Render time tracking
- Memory usage monitoring
- Performance measurement utilities
- Development-time logging

**Usage:**
```tsx
import { usePerformance, useLargeDatasetPerformance } from '../hooks/usePerformance';

const { measureAsync, getMetrics } = usePerformance({
  componentName: 'MyComponent',
  trackMemory: true
});

const {
  shouldUseVirtualization,
  shouldUsePagination,
  datasetSize
} = useLargeDatasetPerformance(data.length);
```

## Utilities

### dataOptimization.ts

Provides utilities for optimizing data processing with large datasets.

**Key Functions:**
- `processBatches()` - Process data in batches to avoid UI blocking
- `createMemoizedTransformer()` - Cache expensive data transformations
- `debounceDataProcessing()` - Debounce data updates
- `efficientFilter()` and `efficientSort()` - Optimized data operations
- `DataAggregator` class - Efficient data aggregation with caching
- `VirtualDataStore` class - Memory-efficient virtual data storage

## Performance Optimizations

### 1. Virtualization
- Only renders visible items using react-window
- Handles millions of rows with consistent performance
- Configurable overscan for smooth scrolling

### 2. Progressive Loading
- Components load content as user scrolls
- Uses intersection observers to trigger loading
- Lazy loads heavy visualization components

### 3. Memory Management
- Limits cached data to prevent memory leaks
- Efficient data structures for large datasets
- Garbage collection-friendly implementations

### 4. Data Processing
- Batch processing to avoid blocking UI thread
- Memoization for expensive calculations
- Debounced updates to reduce re-renders

### 5. Bundle Optimization
- Lazy loading of heavy components
- Tree shaking for unused code
- Code splitting at route and component level

## Best Practices

### When to Use Virtualization
- Lists/tables with > 1,000 items
- Complex item renderers
- Mobile devices with limited memory
- Data that updates frequently

### Performance Thresholds
- **Small datasets** (< 1,000 items): Use regular components
- **Medium datasets** (1,000 - 10,000 items): Use virtualization
- **Large datasets** (10,000 - 100,000 items): Use virtualization + pagination
- **Huge datasets** (> 100,000 items): Use virtualization + infinite scroll + data streaming

### Memory Considerations
- Monitor memory usage in development
- Implement data cleanup on component unmount
- Use object pooling for frequently created objects
- Limit concurrent API requests

### User Experience
- Always show loading states
- Implement skeleton screens
- Provide progress indicators for long operations
- Graceful error handling and retry mechanisms

## Browser Support

- **Chrome**: Full support (recommended)
- **Firefox**: Full support
- **Safari**: Full support with polyfills
- **Edge**: Full support
- **Mobile**: Optimized for touch interactions

## Performance Metrics

Expected performance improvements:
- **Initial render**: 10x faster for large datasets
- **Memory usage**: 60-80% reduction for virtualized components
- **Scroll performance**: 60fps maintained with 100k+ items
- **Bundle size**: 15-20% reduction through code splitting