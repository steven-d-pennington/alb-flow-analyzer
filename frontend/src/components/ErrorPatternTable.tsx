import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Chip
} from '@mui/material';

interface ErrorPatternData {
  statusCode: number;
  count: number;
  percentage: number;
  topEndpoints: string[];
  avgResponseTime: number;
}

interface ErrorPatternTableProps {
  data?: ErrorPatternData[];
  title?: string;
}

const ErrorPatternTable: React.FC<ErrorPatternTableProps> = ({ 
  data = [], 
  title = "Error Patterns" 
}) => {
  const sampleData: ErrorPatternData[] = [
    { statusCode: 404, count: 1250, percentage: 2.1, topEndpoints: ['/api/missing', '/old-endpoint'], avgResponseTime: 45 },
    { statusCode: 500, count: 320, percentage: 0.5, topEndpoints: ['/api/process', '/api/heavy'], avgResponseTime: 1200 },
    { statusCode: 403, count: 180, percentage: 0.3, topEndpoints: ['/admin/', '/api/restricted'], avgResponseTime: 23 },
    { statusCode: 502, count: 95, percentage: 0.2, topEndpoints: ['/api/external', '/proxy/service'], avgResponseTime: 5000 },
    { statusCode: 429, count: 45, percentage: 0.1, topEndpoints: ['/api/rate-limited'], avgResponseTime: 12 }
  ];

  const displayData = data.length > 0 ? data : sampleData;

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warning';
    return 'success';
  };

  const getResponseTimeColor = (time: number) => {
    if (time > 1000) return 'error';
    if (time > 500) return 'warning';
    return 'success';
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Status Code</strong></TableCell>
              <TableCell align="right"><strong>Count</strong></TableCell>
              <TableCell align="right"><strong>Percentage</strong></TableCell>
              <TableCell><strong>Top Endpoints</strong></TableCell>
              <TableCell align="right"><strong>Avg Response Time</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayData.slice(0, 10).map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Chip 
                    label={row.statusCode}
                    color={getStatusColor(row.statusCode)}
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  {row.count.toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  {row.percentage}%
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {row.topEndpoints.slice(0, 2).join(', ')}
                    {row.topEndpoints.length > 2 && '...'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Chip 
                    label={`${row.avgResponseTime}ms`}
                    color={getResponseTimeColor(row.avgResponseTime)}
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ErrorPatternTable;