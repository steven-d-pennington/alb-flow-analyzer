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

interface EndpointData {
  endpoint: string;
  requests: number;
  avgResponseTime: number;
  errorRate: number;
}

interface EndpointTableProps {
  data?: EndpointData[];
  title?: string;
}

const EndpointTable: React.FC<EndpointTableProps> = ({ 
  data = [], 
  title = "Top Endpoints" 
}) => {
  // Sample data if none provided
  const sampleData: EndpointData[] = [
    { endpoint: '/api/login', requests: 1250, avgResponseTime: 145, errorRate: 2.1 },
    { endpoint: '/api/users', requests: 980, avgResponseTime: 89, errorRate: 0.5 },
    { endpoint: '/api/dashboard', requests: 750, avgResponseTime: 234, errorRate: 1.2 },
    { endpoint: '/api/reports', requests: 650, avgResponseTime: 567, errorRate: 0.8 },
    { endpoint: '/static/assets', requests: 2150, avgResponseTime: 23, errorRate: 0.1 }
  ];

  const displayData = data.length > 0 ? data : sampleData;

  const getErrorRateColor = (rate: number) => {
    if (rate > 5) return 'error';
    if (rate > 2) return 'warning';
    return 'success';
  };

  const getResponseTimeColor = (time: number) => {
    if (time > 500) return 'error';
    if (time > 200) return 'warning';
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
              <TableCell><strong>Endpoint</strong></TableCell>
              <TableCell align="right"><strong>Requests</strong></TableCell>
              <TableCell align="right"><strong>Avg Response Time</strong></TableCell>
              <TableCell align="right"><strong>Error Rate</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayData.slice(0, 10).map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {row.endpoint}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {row.requests.toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  <Chip 
                    label={`${row.avgResponseTime}ms`}
                    color={getResponseTimeColor(row.avgResponseTime)}
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Chip 
                    label={`${row.errorRate}%`}
                    color={getErrorRateColor(row.errorRate)}
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

export default EndpointTable;