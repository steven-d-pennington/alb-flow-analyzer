import React, { useState, useMemo, lazy, Suspense } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Paper,
  Divider,
  Fade,
  Skeleton
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Assessment as AssessmentIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  Web as WebIcon,
  Error as ErrorIcon,
  GetApp as ExportIcon
} from '@mui/icons-material';
import { useAnalysis } from '../hooks/useAnalysis';
import { FilterControls } from './FilterControls';
import {
  TrafficChart,
  StatusCodeChart,
  ResponseTimeChart,
  EndpointChart
} from './charts';
import { ExportInterface } from './ExportInterface';
import {
  VirtualizedTable,
  VirtualizedList,
  DashboardSkeleton,
  ChartSkeleton,
  MetricCardSkeleton,
  type ColumnDef
} from './virtualized';
import { format } from 'date-fns';
import { useInView } from 'react-intersection-observer';

// Lazy load heavy components
const LazyEndpointTable = lazy(() => import('./EndpointTable'));
const LazyConnectionTable = lazy(() => import('./ClientIPTable')); // Note: exports ConnectionTable now
const LazyErrorPatternTable = lazy(() => import('./ErrorPatternTable'));

interface AnalysisDashboardProps {
  className?: string;
}

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({
  className
}) => {
  const {
    analysisResult,
    isLoading,
    error,
    filters,
    applyFilters,
    refreshData,
    clearFilters
  } = useAnalysis();

  const [refreshing, setRefreshing] = useState(false);
  const [showExportInterface, setShowExportInterface] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));

  // Intersection observer refs for progressive loading
  const { ref: chartsRef, inView: chartsInView } = useInView({ triggerOnce: true, threshold: 0.1 });
  const { ref: detailsRef, inView: detailsInView } = useInView({ triggerOnce: true, threshold: 0.1 });
  const { ref: tablesRef, inView: tablesInView } = useInView({ triggerOnce: true, threshold: 0.1 });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // Memoized data transformations for virtualization
  const endpointTableData = useMemo(() => {
    if (!analysisResult?.metrics.endpointStats) return [];
    return analysisResult.metrics.endpointStats.map((stat, index) => ({
      id: `endpoint-${index}`,
      endpoint: stat.endpoint,
      count: stat.requestCount, // Backend uses 'requestCount', not 'count'
      percentage: ((stat.requestCount / analysisResult.metrics.totalRequests) * 100).toFixed(1),
      avgResponseTime: stat.averageResponseTime?.toFixed(1) || 'N/A',
      errorRate: stat.errorRate?.toFixed(1) || '0.0',
    }));
  }, [analysisResult]);

  const connectionTableData = useMemo(() => {
    if (!analysisResult?.metrics.connectionStats) return [];
    return analysisResult.metrics.connectionStats.map((stat, index) => ({
      id: `connection-${index}`,
      connectionId: stat.connectionId,
      count: stat.count,
      percentage: ((stat.count / analysisResult.metrics.totalRequests) * 100).toFixed(1),
      avgResponseTime: stat.averageResponseTime?.toFixed(1) || 'N/A',
      errorRate: stat.errorRate?.toFixed(1) || '0.0',
      topEndpoints: stat.endpoints?.slice(0, 3).join(', ') || 'N/A',
    }));
  }, [analysisResult]);

  // Column definitions for virtualized tables
  const endpointColumns: ColumnDef[] = [
    { key: 'endpoint', header: 'Endpoint', width: '40%', align: 'left' },
    { key: 'count', header: 'Requests', width: '15%', align: 'right', render: (value) => value.toLocaleString() },
    { key: 'percentage', header: '%', width: '10%', align: 'right', render: (value) => `${value}%` },
    { key: 'avgResponseTime', header: 'Avg Time', width: '15%', align: 'right', render: (value) => `${value}ms` },
    { key: 'errorRate', header: 'Error Rate', width: '20%', align: 'right', render: (value) => `${value}%` },
  ];

  const connectionColumns: ColumnDef[] = [
    { key: 'connectionId', header: 'Connection ID', width: '25%', align: 'left' },
    { key: 'count', header: 'Requests', width: '15%', align: 'right', render: (value) => value.toLocaleString() },
    { key: 'percentage', header: '%', width: '10%', align: 'right', render: (value) => `${value}%` },
    { key: 'avgResponseTime', header: 'Avg Time', width: '15%', align: 'right', render: (value) => `${value}ms` },
    { key: 'errorRate', header: 'Error Rate', width: '15%', align: 'right', render: (value) => `${value}%` },
    { key: 'topEndpoints', header: 'Top Endpoints', width: '20%', align: 'left' },
  ];

  if (error) {
    return (
      <Box className={className}>
        <Alert 
          severity="error" 
          action={
            <Button color="inherit" size="small" onClick={handleRefresh}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box className={className}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <AssessmentIcon fontSize="large" color="primary" />
          <Typography variant="h4" component="h1">
            Analysis Dashboard
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          {analysisResult && (
            <Button
              variant="contained"
              startIcon={<ExportIcon />}
              onClick={() => setShowExportInterface(true)}
              color="secondary"
            >
              Export
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={handleRefresh}
            disabled={isLoading || refreshing}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Filter Controls */}
      <FilterControls
        filters={filters}
        onFiltersChange={applyFilters}
        onClearFilters={clearFilters}
        isLoading={isLoading}
      />

      {/* Loading State */}
      {isLoading && !analysisResult && (
        <DashboardSkeleton height={800} />
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <div>
          {/* Summary Cards */}
          <Fade in={true} timeout={500}>
            <Grid container spacing={3} mb={4}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={2}>
                      <TimelineIcon color="primary" />
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Total Requests
                        </Typography>
                        <Typography variant="h5">
                          {formatNumber(analysisResult.metrics.totalRequests)}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={2}>
                      <SpeedIcon color="primary" />
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Avg Response Time
                        </Typography>
                        <Typography variant="h5">
                          {analysisResult.metrics.responseTimePercentiles.average.toFixed(1)}ms
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={2}>
                      <WebIcon color="primary" />
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Unique Endpoints
                        </Typography>
                        <Typography variant="h5">
                          {analysisResult.metrics.endpointStats.length}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={2}>
                      <ErrorIcon color="primary" />
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Error Rate
                        </Typography>
                        <Typography variant="h5">
                          {(() => {
                            const errorCodes = analysisResult.metrics.statusCodeDistribution
                              .filter(s => s.statusCode >= 400)
                              .reduce((sum, s) => sum + s.count, 0);
                            const errorRate = (errorCodes / analysisResult.metrics.totalRequests) * 100;
                            return `${errorRate.toFixed(2)}%`;
                          })()}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Fade>

          {/* Analysis Info */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">
                  Showing {formatNumber(analysisResult.filteredEntryCount)} of{' '}
                  {formatNumber(analysisResult.totalEntryCount)} log entries
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box display="flex" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} gap={1}>
                  <Chip
                    label={`Processed in ${formatDuration(analysisResult.processingTime)}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`Updated ${format(analysisResult.lastUpdated, 'MMM dd, HH:mm:ss')}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Charts Grid - Progressive Loading */}
          <div ref={chartsRef}>
            {chartsInView ? (
              <Fade in={true} timeout={800}>
                <Grid container spacing={3}>
                  {/* Traffic Over Time */}
                  <Grid item xs={12} lg={8}>
                    <Suspense fallback={<ChartSkeleton height={350} />}>
                      <TrafficChart
                        data={analysisResult.metrics.requestsPerMinute}
                        title="Requests Per Minute"
                        timeFormat="HH:mm"
                        height={350}
                      />
                    </Suspense>
                  </Grid>

                  {/* Status Code Distribution */}
                  <Grid item xs={12} lg={4}>
                    <Suspense fallback={<ChartSkeleton height={350} />}>
                      <StatusCodeChart
                        data={analysisResult.metrics.statusCodeDistribution}
                        height={350}
                      />
                    </Suspense>
                  </Grid>

                  {/* Response Time Percentiles */}
                  <Grid item xs={12} md={6}>
                    <Suspense fallback={<ChartSkeleton height={300} />}>
                      <ResponseTimeChart
                        data={analysisResult.metrics.responseTimePercentiles}
                        height={300}
                      />
                    </Suspense>
                  </Grid>

                  {/* Top Endpoints */}
                  <Grid item xs={12} md={6}>
                    <Suspense fallback={<ChartSkeleton height={300} />}>
                      <EndpointChart
                        data={analysisResult.metrics.endpointStats}
                        height={300}
                        maxEndpoints={8}
                      />
                    </Suspense>
                  </Grid>
                </Grid>
              </Fade>
            ) : (
              <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                  <ChartSkeleton height={350} />
                </Grid>
                <Grid item xs={12} lg={4}>
                  <ChartSkeleton height={350} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <ChartSkeleton height={300} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <ChartSkeleton height={300} />
                </Grid>
              </Grid>
            )}
          </div>

          {/* Additional Analysis Results */}
          <Grid container spacing={3}>
            {/* Peak Periods */}
            {analysisResult.metrics.peakPeriods.length > 0 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Peak Traffic Periods
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                      {analysisResult.metrics.peakPeriods.slice(0, 6).map((period, index) => (
                        <Grid item xs={12} sm={6} md={4} key={index}>
                          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Peak {index + 1}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {format(period.startTime, 'MMM dd, HH:mm')} -{' '}
                              {format(period.endTime, 'HH:mm')}
                            </Typography>
                            <Typography variant="body2">
                              {formatNumber(period.requestCount)} requests
                            </Typography>
                            <Typography variant="body2">
                              {period.averageRpm.toFixed(0)} req/min avg
                            </Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Response Time Breakdown */}
            {analysisResult.metrics.responseTimeBreakdown && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Response Time Breakdown
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography variant="subtitle2" color="primary" gutterBottom>
                            Request Processing
                          </Typography>
                          <Typography variant="body2">
                            P50: {analysisResult.metrics.responseTimeBreakdown.requestProcessing.p50.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P95: {analysisResult.metrics.responseTimeBreakdown.requestProcessing.p95.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P99: {analysisResult.metrics.responseTimeBreakdown.requestProcessing.p99.toFixed(1)}ms
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography variant="subtitle2" color="primary" gutterBottom>
                            Target Processing
                          </Typography>
                          <Typography variant="body2">
                            P50: {analysisResult.metrics.responseTimeBreakdown.targetProcessing.p50.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P95: {analysisResult.metrics.responseTimeBreakdown.targetProcessing.p95.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P99: {analysisResult.metrics.responseTimeBreakdown.targetProcessing.p99.toFixed(1)}ms
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography variant="subtitle2" color="primary" gutterBottom>
                            Response Processing
                          </Typography>
                          <Typography variant="body2">
                            P50: {analysisResult.metrics.responseTimeBreakdown.responseProcessing.p50.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P95: {analysisResult.metrics.responseTimeBreakdown.responseProcessing.p95.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P99: {analysisResult.metrics.responseTimeBreakdown.responseProcessing.p99.toFixed(1)}ms
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Total Response Time
                          </Typography>
                          <Typography variant="body2">
                            P50: {analysisResult.metrics.responseTimeBreakdown.total.p50.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P95: {analysisResult.metrics.responseTimeBreakdown.total.p95.toFixed(1)}ms
                          </Typography>
                          <Typography variant="body2">
                            P99: {analysisResult.metrics.responseTimeBreakdown.total.p99.toFixed(1)}ms
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Connections Table */}
            <div ref={tablesRef}>
              {tablesInView && analysisResult?.metrics.connectionStats && analysisResult.metrics.connectionStats.length > 0 && (
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Connection Analysis ({connectionTableData.length} total)
                      </Typography>
                      <Divider sx={{ mb: 2 }} />
                      <Box sx={{ height: 400, overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff', borderBottom: '2px solid #e0e0e0' }}>
                            <tr>
                              {connectionColumns.map((column) => (
                                <th
                                  key={column.key}
                                  style={{
                                    padding: '12px 16px',
                                    textAlign: column.align || 'left',
                                    width: column.width,
                                    minWidth: column.minWidth,
                                    maxWidth: column.maxWidth,
                                    fontWeight: 600,
                                  }}
                                >
                                  {column.header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {connectionTableData.slice(0, 100).map((row, index) => (
                              <tr
                                key={row.id}
                                style={{
                                  borderBottom: '1px solid #f0f0f0',
                                  '&:hover': { backgroundColor: '#f5f5f5' }
                                }}
                              >
                                {connectionColumns.map((column) => {
                                  const value = row[column.key];
                                  const cellContent = column.render ? column.render(value, row, index) : value;
                                  return (
                                    <td
                                      key={column.key}
                                      style={{
                                        padding: '12px 16px',
                                        textAlign: column.align || 'left',
                                        borderBottom: '1px solid #f0f0f0',
                                      }}
                                    >
                                      {cellContent}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Box>
                      {clientIPTableData.length > 100 && (
                        <Typography variant="body2" color="textSecondary" mt={2}>
                          Showing first 100 of {clientIPTableData.length} client IPs
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </div>

            {/* Error Patterns */}
            {analysisResult.metrics.errorPatterns && analysisResult.metrics.errorPatterns.length > 0 && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Error Patterns
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    {analysisResult.metrics.errorPatterns.slice(0, 5).map((pattern, index) => (
                      <Box key={index} mb={1.5}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2">
                            {pattern.statusCode} - {pattern.endpoint.substring(0, 40)}
                            {pattern.endpoint.length > 40 ? '...' : ''}
                          </Typography>
                          <Chip 
                            label={`${pattern.count} occurrences`} 
                            size="small" 
                            color="error"
                            variant="outlined"
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(pattern.timeRange.start), 'MMM dd HH:mm')} - {format(new Date(pattern.timeRange.end), 'HH:mm')}
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* User Agent Stats with Enhanced Info */}
            {analysisResult.metrics.userAgentStats && analysisResult.metrics.userAgentStats.length > 0 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      User Agent Analysis
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                      {analysisResult.metrics.userAgentStats.slice(0, 8).map((ua, index) => (
                        <Grid item xs={12} sm={6} md={3} key={index}>
                          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                            <Typography variant="subtitle2" noWrap>
                              {ua.userAgent}
                            </Typography>
                            <Typography variant="caption" color="primary">
                              {ua.category}
                            </Typography>
                            <Box mt={1}>
                              <Typography variant="body2">
                                {ua.count.toLocaleString()} requests ({ua.percentage.toFixed(1)}%)
                              </Typography>
                              <Typography variant="body2">
                                Avg: {ua.averageResponseTime.toFixed(1)}ms
                              </Typography>
                              <Typography variant="body2" color={ua.errorRate > 5 ? 'error' : 'text.secondary'}>
                                Errors: {ua.errorRate.toFixed(1)}%
                              </Typography>
                            </Box>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Endpoints Table */}
            {endpointTableData.length > 0 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Endpoint Performance ({endpointTableData.length} total)
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Box sx={{ height: 500, overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff', borderBottom: '2px solid #e0e0e0' }}>
                          <tr>
                            {endpointColumns.map((column) => (
                              <th
                                key={column.key}
                                style={{
                                  padding: '12px 16px',
                                  textAlign: column.align || 'left',
                                  width: column.width,
                                  minWidth: column.minWidth,
                                  maxWidth: column.maxWidth,
                                  fontWeight: 600,
                                }}
                              >
                                {column.header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {endpointTableData.slice(0, 100).map((row, index) => (
                            <tr
                              key={row.id}
                              style={{
                                borderBottom: '1px solid #f0f0f0',
                                '&:hover': { backgroundColor: '#f5f5f5' }
                              }}
                            >
                              {endpointColumns.map((column) => {
                                const value = row[column.key];
                                const cellContent = column.render ? column.render(value, row, index) : value;
                                return (
                                  <td
                                    key={column.key}
                                    style={{
                                      padding: '12px 16px',
                                      textAlign: column.align || 'left',
                                      borderBottom: '1px solid #f0f0f0',
                                    }}
                                  >
                                    {cellContent}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>
                    {endpointTableData.length > 100 && (
                      <Typography variant="body2" color="textSecondary" mt={2}>
                        Showing first 100 of {endpointTableData.length} endpoints
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </div>
      )}

      {/* No Data State */}
      {!isLoading && !analysisResult && !error && (
        <Box textAlign="center" py={8}>
          <AssessmentIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            No Analysis Data Available
          </Typography>
          <Typography color="text.secondary" mb={3}>
            Upload and process some ALB flow logs to see analysis results here.
          </Typography>
        </Box>
      )}

      {/* Export Interface */}
      <ExportInterface
        analysisResult={analysisResult}
        isVisible={showExportInterface}
        onClose={() => setShowExportInterface(false)}
      />
    </Box>
  );
};