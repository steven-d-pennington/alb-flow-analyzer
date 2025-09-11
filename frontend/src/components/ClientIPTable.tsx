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

interface ConnectionData {
  connectionId: string;
  requests: number;
  uniqueEndpoints: number;
  avgResponseTime: number;
  errorRate: number;
}

interface ConnectionTableProps {
  data?: ConnectionData[];
  title?: string;
}

const ConnectionTable: React.FC<ConnectionTableProps> = ({ 
  data = [], 
  title = "Top Connections" 
}) => {
  const sampleData: ConnectionData[] = [
    { connectionId: 'TID_93f411108fbb3143bd96e3b131d6f945', requests: 15420, uniqueEndpoints: 25, avgResponseTime: 142, errorRate: 1.2 },
    { connectionId: 'TID_fa92fc7f4380f64f893999d86f74adb6', requests: 12850, uniqueEndpoints: 18, avgResponseTime: 156, errorRate: 0.8 },
    { connectionId: 'TID_48a95388b45455489a49e609dcd597cc', requests: 11200, uniqueEndpoints: 22, avgResponseTime: 134, errorRate: 2.1 },
    { connectionId: 'TID_3759cc10d8f71341bda7090e2df13e75', requests: 9840, uniqueEndpoints: 15, avgResponseTime: 128, errorRate: 0.5 },
    { connectionId: 'TID_1234567890abcdef1234567890abcdef', requests: 8750, uniqueEndpoints: 20, avgResponseTime: 167, errorRate: 1.8 }
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
              <TableCell><strong>Connection ID</strong></TableCell>
              <TableCell align="right"><strong>Requests</strong></TableCell>
              <TableCell align="right"><strong>Endpoints</strong></TableCell>
              <TableCell align="right"><strong>Avg Response Time</strong></TableCell>
              <TableCell align="right"><strong>Error Rate</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayData.slice(0, 10).map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {row.connectionId.substring(0, 24)}...
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {row.requests.toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  {row.uniqueEndpoints}
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

export default ConnectionTable;
export { type ConnectionData, type ConnectionTableProps };