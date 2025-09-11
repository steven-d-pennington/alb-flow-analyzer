import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { Search, FilterList } from '@mui/icons-material';
import { TransitionProbability } from '../types/workflow';

interface TransitionMatrixProps {
  transitionMatrix: Record<string, Record<string, TransitionProbability>>;
  title?: string;
  maxRows?: number;
  onCellClick?: (from: string, to: string, data: TransitionProbability) => void;
}

type ViewMode = 'heatmap' | 'table' | 'top-transitions';
type SortBy = 'probability' | 'count' | 'time';

const TransitionMatrix: React.FC<TransitionMatrixProps> = ({
  transitionMatrix,
  title,
  maxRows = 20,
  onCellClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [sortBy, setSortBy] = useState<SortBy>('probability');
  const [minProbability, setMinProbability] = useState(0.01);

  // Process matrix data
  const { allEndpoints, matrixData, topTransitions } = useMemo(() => {
    const endpoints = new Set<string>();
    const data: Array<{
      from: string;
      to: string;
      probability: number;
      count: number;
      averageTime: number;
    }> = [];

    // Collect all endpoints and transitions
    Object.entries(transitionMatrix).forEach(([from, targets]) => {
      endpoints.add(from);
      Object.entries(targets).forEach(([to, transitionData]) => {
        endpoints.add(to);
        data.push({
          from,
          to,
          probability: transitionData.probability,
          count: transitionData.count,
          averageTime: transitionData.averageTime
        });
      });
    });

    // Filter by search term and minimum probability
    const filteredData = data.filter(item => {
      const matchesSearch = searchTerm === '' || 
        item.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.to.toLowerCase().includes(searchTerm.toLowerCase());
      const meetsMinProbability = item.probability >= minProbability;
      return matchesSearch && meetsMinProbability;
    });

    // Sort top transitions
    const sortedTransitions = [...filteredData].sort((a, b) => {
      switch (sortBy) {
        case 'count':
          return b.count - a.count;
        case 'time':
          return b.averageTime - a.averageTime;
        default:
          return b.probability - a.probability;
      }
    });

    return {
      allEndpoints: Array.from(endpoints).slice(0, maxRows),
      matrixData: filteredData,
      topTransitions: sortedTransitions.slice(0, 50) // Top 50 transitions
    };
  }, [transitionMatrix, searchTerm, sortBy, minProbability, maxRows]);

  // Color scale for heatmap
  const getHeatmapColor = (probability: number): string => {
    if (probability === 0) return '#f5f5f5';
    const intensity = Math.min(probability * 2, 1); // Scale up intensity
    const red = Math.floor(255 - (intensity * 255));
    const green = Math.floor(255 - (intensity * 100));
    const blue = Math.floor(255 - (intensity * 100));
    return `rgb(${red}, ${green}, ${blue})`;
  };

  // Format time duration
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const renderHeatmapView = () => (
    <TableContainer sx={{ maxHeight: 600, border: '1px solid #e0e0e0' }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold', minWidth: 120 }}>
              From / To
            </TableCell>
            {allEndpoints.map((endpoint) => (
              <TableCell 
                key={endpoint} 
                align="center" 
                sx={{ 
                  backgroundColor: '#f5f5f5', 
                  fontWeight: 'bold',
                  minWidth: 100,
                  fontSize: '11px',
                  transform: 'rotate(-45deg)',
                  transformOrigin: 'center',
                  height: 80
                }}
              >
                {endpoint.replace('/api/', '').substring(0, 10)}...
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {allEndpoints.map((fromEndpoint) => (
            <TableRow key={fromEndpoint}>
              <TableCell 
                sx={{ 
                  fontWeight: 'bold', 
                  fontSize: '11px',
                  maxWidth: 120,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                <Tooltip title={fromEndpoint}>
                  <span>{fromEndpoint.replace('/api/', '')}</span>
                </Tooltip>
              </TableCell>
              {allEndpoints.map((toEndpoint) => {
                const transition = transitionMatrix[fromEndpoint]?.[toEndpoint];
                const probability = transition?.probability || 0;
                const count = transition?.count || 0;
                
                return (
                  <TableCell
                    key={`${fromEndpoint}-${toEndpoint}`}
                    align="center"
                    sx={{
                      backgroundColor: getHeatmapColor(probability),
                      cursor: transition ? 'pointer' : 'default',
                      fontSize: '10px',
                      padding: '4px',
                      '&:hover': transition ? {
                        backgroundColor: '#1976d2',
                        color: 'white',
                      } : {}
                    }}
                    onClick={() => {
                      if (transition && onCellClick) {
                        onCellClick(fromEndpoint, toEndpoint, transition);
                      }
                    }}
                  >
                    {transition && (
                      <Tooltip title={`${count} users • ${(probability * 100).toFixed(1)}% • ${formatTime(transition.averageTime)}`}>
                        <span>
                          {probability > 0.01 ? `${(probability * 100).toFixed(0)}%` : ''}
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderTableView = () => (
    <TableContainer sx={{ maxHeight: 600 }}>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>From Endpoint</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>To Endpoint</TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Users</TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Probability</TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Avg Time</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {topTransitions.map(({ from, to, probability, count, averageTime }, index) => (
            <TableRow 
              key={`${from}-${to}`}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => {
                if (onCellClick) {
                  const transitionData = transitionMatrix[from]?.[to];
                  if (transitionData) {
                    onCellClick(from, to, transitionData);
                  }
                }
              }}
            >
              <TableCell sx={{ maxWidth: 200 }}>
                <Tooltip title={from}>
                  <Typography variant="body2" noWrap>
                    {from}
                  </Typography>
                </Tooltip>
              </TableCell>
              <TableCell sx={{ maxWidth: 200 }}>
                <Tooltip title={to}>
                  <Typography variant="body2" noWrap>
                    {to}
                  </Typography>
                </Tooltip>
              </TableCell>
              <TableCell align="right">
                <Chip 
                  size="small" 
                  label={count.toLocaleString()}
                  color={count > 1000 ? 'primary' : count > 100 ? 'secondary' : 'default'}
                />
              </TableCell>
              <TableCell align="right">
                <Chip 
                  size="small" 
                  label={`${(probability * 100).toFixed(1)}%`}
                  color={probability > 0.5 ? 'error' : probability > 0.2 ? 'warning' : 'info'}
                  variant="outlined"
                />
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" color="text.secondary">
                  {formatTime(averageTime)}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderTopTransitionsView = () => (
    <Box>
      {topTransitions.slice(0, 10).map(({ from, to, probability, count, averageTime }, index) => (
        <Paper 
          key={`${from}-${to}`} 
          sx={{ 
            p: 2, 
            mb: 2, 
            cursor: 'pointer',
            '&:hover': { backgroundColor: '#f5f5f5' }
          }}
          onClick={() => {
            if (onCellClick) {
              const transitionData = transitionMatrix[from]?.[to];
              if (transitionData) {
                onCellClick(from, to, transitionData);
              }
            }
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography variant="h6" color="primary">
              #{index + 1}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip size="small" label={`${count} users`} color="primary" />
              <Chip size="small" label={`${(probability * 100).toFixed(1)}%`} variant="outlined" />
            </Box>
          </Box>
          
          <Typography variant="body1" sx={{ mb: 1 }}>
            <strong>{from}</strong> → <strong>{to}</strong>
          </Typography>
          
          <Typography variant="body2" color="text.secondary">
            Average transition time: {formatTime(averageTime)}
          </Typography>
        </Paper>
      ))}
    </Box>
  );

  if (!Object.keys(transitionMatrix).length) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No transition data available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Process some log files to see user transition patterns
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {title && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <TextField
            size="small"
            placeholder="Search endpoints..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 200 }}
          />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort by</InputLabel>
            <Select
              value={sortBy}
              label="Sort by"
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              <MenuItem value="probability">Probability</MenuItem>
              <MenuItem value="count">User Count</MenuItem>
              <MenuItem value="time">Avg Time</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="number"
            label="Min Probability"
            value={minProbability}
            onChange={(e) => setMinProbability(Number(e.target.value))}
            inputProps={{ min: 0, max: 1, step: 0.01 }}
            sx={{ width: 130 }}
          />
        </Box>

        <Tabs value={viewMode} onChange={(e, v) => setViewMode(v)}>
          <Tab label="Heatmap" value="heatmap" />
          <Tab label="Table" value="table" />
          <Tab label="Top Transitions" value="top-transitions" />
        </Tabs>
      </Paper>

      {/* Content */}
      <Paper sx={{ p: 2 }}>
        {viewMode === 'heatmap' && renderHeatmapView()}
        {viewMode === 'table' && renderTableView()}
        {viewMode === 'top-transitions' && renderTopTransitionsView()}
      </Paper>

      {/* Summary */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Chip label={`${matrixData.length} transitions found`} variant="outlined" />
        <Chip label={`${allEndpoints.length} endpoints`} variant="outlined" />
        {viewMode === 'heatmap' && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 2 }}>
            💡 Darker cells indicate higher transition probability • Click cells for details
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default TransitionMatrix;