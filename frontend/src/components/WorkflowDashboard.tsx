import React, { useState, useEffect, useMemo, Suspense, lazy, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardHeader,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Collapse,
  Switch,
  FormControlLabel,
  Divider,
  Fade,
} from '@mui/material';
import {
  Timeline,
  TrendingUp,
  Warning,
  Info,
  Error,
  CheckCircle,
  Refresh,
  Settings,
  Insights,
  FilterList,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import {
  VirtualizedList,
  VirtualizedTable,
  SessionListItem,
  DashboardSkeleton,
  MetricCardSkeleton,
  type ColumnDef,
  type SessionItemProps
} from './virtualized';
import { useInfinitePagination } from '../hooks/usePagination';
import { useInView } from 'react-intersection-observer';

// Lazy load heavy visualization components
const LazySankeyDiagram = lazy(() => import('./SankeyDiagram'));
const LazyWorkflowFlowChart = lazy(() => import('./WorkflowFlowChart'));
const LazyTransitionMatrix = lazy(() => import('./TransitionMatrix'));
import { WorkflowService } from '../services/workflowService';
import {
  WorkflowAnalysisResult,
  WorkflowFilterCriteria,
  WorkflowAnalysisOptions,
  SankeyData,
  FlowChartData,
  WorkflowInsight,
  Session,
  WorkflowPattern,
} from '../types/workflow';

const WorkflowDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<WorkflowAnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState<WorkflowPattern | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | undefined>();

  // Intersection observers for progressive loading
  const { ref: visualizationsRef, inView: visualizationsInView } = useInView({ triggerOnce: true, threshold: 0.1 });
  const { ref: patternsRef, inView: patternsInView } = useInView({ triggerOnce: true, threshold: 0.1 });
  
  // Filter states
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [excludeEndpoints, setExcludeEndpoints] = useState('/app/vgc.cfm');
  const [includeOnlyEndpoints, setIncludeOnlyEndpoints] = useState('');
  const [excludeUserAgents, setExcludeUserAgents] = useState('');
  const [minSessionDuration, setMinSessionDuration] = useState('');
  const [filtersEnabled, setFiltersEnabled] = useState(false);

  // Build current filters object from state
  const buildFilters = (): WorkflowFilterCriteria => {
    const filters: WorkflowFilterCriteria = {};
    
    if (filtersEnabled) {
      if (excludeEndpoints.trim()) {
        filters.excludeEndpoints = excludeEndpoints.split(',').map(e => e.trim()).filter(e => e);
      }
      if (includeOnlyEndpoints.trim()) {
        filters.includeOnlyEndpoints = includeOnlyEndpoints.split(',').map(e => e.trim()).filter(e => e);
      }
      if (excludeUserAgents.trim()) {
        filters.excludeUserAgents = excludeUserAgents.split(',').map(e => e.trim()).filter(e => e);
      }
      if (minSessionDuration.trim() && !isNaN(Number(minSessionDuration))) {
        filters.minSessionDuration = Number(minSessionDuration) * 1000; // Convert seconds to milliseconds
      }
    }
    
    return filters;
  };

  // Load workflow analysis data
  const loadWorkflowData = async (customFilters?: WorkflowFilterCriteria) => {
    try {
      setLoading(true);
      setError(null);
      
      const filters = customFilters || buildFilters();
      const hasFilters = Object.keys(filters).length > 0;
      
      const data = hasFilters
        ? await WorkflowService.getFilteredWorkflowAnalysis(filters)
        : await WorkflowService.getWorkflowAnalysis();
      
      setAnalysisData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow data');
      console.error('Error loading workflow data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Virtualized session data
  const sessionData = useMemo(() => {
    if (!analysisData?.sessions) return [];
    return analysisData.sessions.map((session, index) => ({
      id: session.sessionId,
      ...session,
      index,
    }));
  }, [analysisData?.sessions]);

  // Pattern table columns
  const patternColumns: ColumnDef[] = [
    { key: 'id', header: 'Pattern ID', width: '15%', align: 'left' },
    { 
      key: 'frequency', 
      header: 'Frequency', 
      width: '15%', 
      align: 'right',
      render: (value) => value.toLocaleString()
    },
    { 
      key: 'successRate', 
      header: 'Success Rate', 
      width: '15%', 
      align: 'right',
      render: (value) => `${(value * 100).toFixed(1)}%`
    },
    { 
      key: 'averageDuration', 
      header: 'Avg Duration', 
      width: '15%', 
      align: 'right',
      render: (value) => `${(value / 1000).toFixed(1)}s`
    },
    { 
      key: 'sequence', 
      header: 'Workflow', 
      width: '40%', 
      align: 'left',
      render: (value, row) => (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {value.slice(0, 5).map((step: string, index: number) => (
            <Chip key={index} size="small" label={step.replace('/api/', '')} variant="outlined" />
          ))}
          {value.length > 5 && (
            <Chip size="small" label={`+${value.length - 5} more`} variant="outlined" color="secondary" />
          )}
        </Box>
      )
    },
  ];

  const renderSessionItem = useCallback((session: any, index: number) => {
    return (
      <SessionListItem
        sessionId={session.sessionId}
        clientIp={session.clientIp}
        duration={session.duration}
        requestCount={session.totalRequests}
        errorCount={session.errorCount}
        timestamp={new Date(session.startTime)}
        selected={selectedSessionIndex === index}
        onClick={() => {
          setSelectedSessionIndex(index);
          handleSessionClick(session.sessionId);
        }}
      />
    );
  }, [selectedSessionIndex]);

  useEffect(() => {
    loadWorkflowData();
  }, []);

  // Convert analysis data to visualization formats
  const { sankeyData, flowChartData } = useMemo(() => {
    if (!analysisData) {
      return { sankeyData: { nodes: [], links: [] }, flowChartData: { nodes: [], edges: [] } };
    }

    const { analysis } = analysisData;

    // Create Sankey data
    const sankeyNodes = new Set<string>();
    const sankeyLinks: Array<{ source: string; target: string; value: number; probability: number }> = [];

    // Add nodes from transitions
    Object.entries(analysis.transitionMatrix).forEach(([from, targets]) => {
      sankeyNodes.add(from);
      Object.entries(targets).forEach(([to, transition]) => {
        sankeyNodes.add(to);
        sankeyLinks.push({
          source: from,
          target: to,
          value: transition.count,
          probability: transition.probability
        });
      });
    });

    const sankeyData: SankeyData = {
      nodes: Array.from(sankeyNodes).map((endpoint, index) => ({
        id: endpoint,
        label: endpoint.replace('/api/', '').substring(0, 20),
        value: analysis.entryPoints[endpoint] || analysis.exitPoints[endpoint] || 0,
        level: index,
        category: analysis.entryPoints[endpoint] ? 'entry' : analysis.exitPoints[endpoint] ? 'exit' : 'flow'
      })),
      links: sankeyLinks.filter(link => link.value > 1) // Only show significant transitions
    };

    // Create Flow Chart data with automatic layout
    const flowNodes: Array<any> = [];
    const flowEdges: Array<any> = [];

    // Position nodes in a grid layout
    const nodePositions = new Map<string, { x: number; y: number }>();
    const nodesArray = Array.from(sankeyNodes);
    const cols = Math.ceil(Math.sqrt(nodesArray.length));
    
    nodesArray.forEach((endpoint, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      nodePositions.set(endpoint, {
        x: col * 200 + 100,
        y: row * 100 + 50
      });
    });

    // Create flow chart nodes
    Array.from(sankeyNodes).forEach((endpoint) => {
      const position = nodePositions.get(endpoint) || { x: 0, y: 0 };
      const isEntry = analysis.entryPoints[endpoint] > 0;
      const isExit = analysis.exitPoints[endpoint] > 0;
      const dropOffPoint = analysis.dropOffPoints.find(p => p.endpoint === endpoint);
      
      let nodeType = 'endpoint';
      if (isEntry) nodeType = 'entry';
      else if (isExit) nodeType = 'exit';
      else if (dropOffPoint) nodeType = 'dropoff';

      flowNodes.push({
        id: endpoint,
        type: nodeType,
        position,
        data: {
          label: endpoint.replace('/api/', ''),
          endpoint,
          count: analysis.entryPoints[endpoint] || analysis.exitPoints[endpoint] || 0,
          percentage: 0, // Calculate if needed
          dropOffRate: dropOffPoint?.dropOffRate,
          type: nodeType
        }
      });
    });

    // Create flow chart edges
    Object.entries(analysis.transitionMatrix).forEach(([from, targets]) => {
      Object.entries(targets).forEach(([to, transition]) => {
        if (transition.count > 5) { // Only show significant transitions
          flowEdges.push({
            id: `${from}-${to}`,
            source: from,
            target: to,
            type: 'smoothstep',
            animated: transition.probability > 0.3,
            data: {
              probability: transition.probability,
              count: transition.count,
              averageTime: transition.averageTime
            }
          });
        }
      });
    });

    const flowChartData: FlowChartData = { nodes: flowNodes, edges: flowEdges };

    return { sankeyData, flowChartData };
  }, [analysisData]);

  const handlePatternClick = async (pattern: WorkflowPattern) => {
    setSelectedPattern(pattern);
    setDetailDialogOpen(true);
  };

  const handleSessionClick = async (sessionId: string) => {
    try {
      const session = await WorkflowService.getSessionDetails(sessionId);
      setSelectedSession(session);
      setDetailDialogOpen(true);
    } catch (err) {
      console.error('Error loading session details:', err);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'high_drop_off':
        return <Warning color="warning" />;
      case 'error_prone_path':
        return <Error color="error" />;
      case 'long_session':
        return <Info color="info" />;
      default:
        return <Insights color="primary" />;
    }
  };

  const getInsightColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      default:
        return 'info';
    }
  };

  if (loading) {
    return <DashboardSkeleton height={800} />;
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Error loading workflow data: {error}
        <Button onClick={() => loadWorkflowData()} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  if (!analysisData) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No workflow data available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Process some log files to see workflow analysis
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Workflow Analysis
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Toggle Filters">
            <IconButton 
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              color={filtersExpanded ? 'primary' : 'default'}
            >
              <FilterList />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh Data">
            <IconButton onClick={() => loadWorkflowData()}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton>
              <Settings />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Filter Panel */}
      <Collapse in={filtersExpanded}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Workflow Filters
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={filtersEnabled}
                  onChange={(e) => {
                    setFiltersEnabled(e.target.checked);
                    if (!e.target.checked) {
                      // Reload without filters when disabled
                      loadWorkflowData({});
                    }
                  }}
                />
              }
              label="Enable Filters"
            />
          </Box>
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Exclude Endpoints"
                placeholder="/app/vgc.cfm, /health, /ping"
                helperText="Comma-separated endpoints to exclude (e.g., keepalive, health checks)"
                value={excludeEndpoints}
                onChange={(e) => setExcludeEndpoints(e.target.value)}
                disabled={!filtersEnabled}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Include Only Endpoints"
                placeholder="/api/users, /api/orders"
                helperText="Comma-separated endpoints to include only (leave empty to include all)"
                value={includeOnlyEndpoints}
                onChange={(e) => setIncludeOnlyEndpoints(e.target.value)}
                disabled={!filtersEnabled}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Exclude User Agents"
                placeholder="bot, crawler, monitor"
                helperText="Comma-separated user agent patterns to exclude"
                value={excludeUserAgents}
                onChange={(e) => setExcludeUserAgents(e.target.value)}
                disabled={!filtersEnabled}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Minimum Session Duration"
                placeholder="5"
                helperText="Minimum session duration in seconds"
                value={minSessionDuration}
                onChange={(e) => setMinSessionDuration(e.target.value)}
                disabled={!filtersEnabled}
                type="number"
                inputProps={{ min: 0 }}
              />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              variant="contained"
              onClick={() => loadWorkflowData()}
              disabled={!filtersEnabled}
              startIcon={<Refresh />}
            >
              Apply Filters
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setExcludeEndpoints('/app/vgc.cfm');
                setIncludeOnlyEndpoints('');
                setExcludeUserAgents('');
                setMinSessionDuration('');
                loadWorkflowData({});
              }}
              disabled={!filtersEnabled}
            >
              Clear Filters
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setExcludeEndpoints('/app/vgc.cfm, icons/navigation, images/, /health, /ping');
                setExcludeUserAgents('bot, crawler, monitor');
                setMinSessionDuration('5');
              }}
              disabled={!filtersEnabled}
            >
              Common Filters
            </Button>
          </Box>
        </Paper>
      </Collapse>

      {/* Summary Cards */}
      <Fade in={true} timeout={500}>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Sessions
                </Typography>
                <Typography variant="h4">
                  {analysisData.summary.totalSessions.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Avg Session Duration
                </Typography>
                <Typography variant="h4">
                  {Math.round(analysisData.summary.averageSessionDuration / 1000)}s
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Patterns Found
                </Typography>
                <Typography variant="h4">
                  {analysisData.analysis.patterns.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Processing Time
                </Typography>
                <Typography variant="h4">
                  {(analysisData.processingTime / 1000).toFixed(1)}s
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Fade>

      {/* Insights */}
      {analysisData.summary.insights.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Key Insights
          </Typography>
          <List>
            {analysisData.summary.insights.slice(0, 5).map((insight, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  {getInsightIcon(insight.type)}
                </ListItemIcon>
                <ListItemText
                  primary={insight.title}
                  secondary={insight.description}
                />
                <Chip 
                  label={insight.severity.toUpperCase()} 
                  color={getInsightColor(insight.severity) as any}
                  size="small" 
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Visualization Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable">
          <Tab label="User Flow (Sankey)" icon={<Timeline />} />
          <Tab label="Workflow Diagram" icon={<TrendingUp />} />
          <Tab label="Transition Matrix" icon={<Settings />} />
          <Tab label="Patterns" icon={<Insights />} />
          <Tab label="Sessions" icon={<CheckCircle />} />
        </Tabs>
      </Paper>

      {/* Tab Content with Progressive Loading */}
      <div ref={visualizationsRef}>
        <Box>
          {activeTab === 0 && (
            visualizationsInView ? (
              <Suspense fallback={<DashboardSkeleton height={600} />}>
                <LazySankeyDiagram
                  data={sankeyData}
                  title="User Flow Visualization"
                  width={1000}
                  height={600}
                  onNodeClick={(node) => console.log('Node clicked:', node)}
                  onLinkClick={(link) => console.log('Link clicked:', link)}
                />
              </Suspense>
            ) : <DashboardSkeleton height={600} />
          )}

          {activeTab === 1 && (
            visualizationsInView ? (
              <Suspense fallback={<DashboardSkeleton height={600} />}>
                <LazyWorkflowFlowChart
                  data={flowChartData}
                  title="Interactive Workflow Diagram"
                  height={600}
                  onNodeClick={(node) => console.log('Flow node clicked:', node)}
                  onEdgeClick={(edge) => console.log('Flow edge clicked:', edge)}
                />
              </Suspense>
            ) : <DashboardSkeleton height={600} />
          )}

          {activeTab === 2 && (
            visualizationsInView ? (
              <Suspense fallback={<DashboardSkeleton height={600} />}>
                <LazyTransitionMatrix
                  transitionMatrix={analysisData.analysis.transitionMatrix}
                  title="Endpoint Transition Probabilities"
                  onCellClick={(from, to, data) => {
                    console.log('Transition clicked:', { from, to, data });
                  }}
                />
              </Suspense>
            ) : <DashboardSkeleton height={600} />
          )}

          {activeTab === 3 && (
            <div ref={patternsRef}>
              {patternsInView ? (
                <Fade in={true} timeout={800}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Workflow Patterns ({analysisData.analysis.patterns.length} total)
                      </Typography>
                      <Divider sx={{ mb: 2 }} />
                      <VirtualizedTable
                        data={analysisData.analysis.patterns}
                        columns={patternColumns}
                        height={600}
                        itemSize={80}
                        onRowClick={(pattern) => handlePatternClick(pattern)}
                        emptyMessage="No workflow patterns found"
                      />
                    </CardContent>
                  </Card>
                </Fade>
              ) : (
                <DashboardSkeleton height={600} />
              )}
            </div>
          )}

          {activeTab === 4 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  User Sessions ({sessionData.length} total)
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <VirtualizedList
                  items={sessionData}
                  height={600}
                  itemSize={80}
                  renderItem={renderSessionItem}
                  emptyMessage="No sessions available"
                />
              </CardContent>
            </Card>
          )}
        </Box>
      </div>

      {/* Detail Dialog */}
      <Dialog 
        open={detailDialogOpen} 
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          {selectedPattern && `Pattern Details: ${selectedPattern.id}`}
          {selectedSession && `Session Details: ${selectedSession.sessionId}`}
        </DialogTitle>
        <DialogContent>
          {selectedPattern && (
            <Box>
              <Typography variant="body1" paragraph>
                <strong>Frequency:</strong> {selectedPattern.frequency} users
              </Typography>
              <Typography variant="body1" paragraph>
                <strong>Success Rate:</strong> {(selectedPattern.successRate * 100).toFixed(1)}%
              </Typography>
              <Typography variant="body1" paragraph>
                <strong>Average Duration:</strong> {(selectedPattern.averageDuration / 1000).toFixed(1)} seconds
              </Typography>
              <Typography variant="body1" paragraph>
                <strong>Example Sessions:</strong>
              </Typography>
              <List dense>
                {selectedPattern.examples.map((sessionId) => (
                  <ListItem key={sessionId} button onClick={() => handleSessionClick(sessionId)}>
                    <ListItemText primary={sessionId} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          
          {selectedSession && (
            <Box>
              <Typography variant="body1" paragraph>
                <strong>Client IP:</strong> {selectedSession.clientIp}
              </Typography>
              <Typography variant="body1" paragraph>
                <strong>Duration:</strong> {(selectedSession.duration / 1000).toFixed(1)} seconds
              </Typography>
              <Typography variant="body1" paragraph>
                <strong>Total Requests:</strong> {selectedSession.totalRequests}
              </Typography>
              <Typography variant="body1" paragraph>
                <strong>Error Count:</strong> {selectedSession.errorCount}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WorkflowDashboard;