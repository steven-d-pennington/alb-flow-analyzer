import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { ResponseTimeStats } from '../../types/analysis';

interface ResponseTimeChartProps {
  data: ResponseTimeStats;
  height?: number;
}

export const ResponseTimeChart: React.FC<ResponseTimeChartProps> = ({
  data,
  height = 300
}) => {
  const chartData = [
    { percentile: '50th', value: data.p50, label: 'P50' },
    { percentile: '90th', value: data.p90, label: 'P90' },
    { percentile: '95th', value: data.p95, label: 'P95' },
    { percentile: '99th', value: data.p99, label: 'P99' },
    { percentile: 'Average', value: data.average, label: 'Avg' },
    { percentile: 'Max', value: data.max, label: 'Max' }
  ];

  const formatTooltip = (value: number) => {
    return [`${value.toFixed(3)}ms`, 'Response Time'];
  };



  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Response Time Percentiles
        </Typography>
        <Box height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                label={{ value: 'Response Time (ms)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={formatTooltip} />
              <Bar 
                dataKey="value" 
                fill="#1976d2"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box mt={2} display="flex" flexWrap="wrap" gap={1}>
          <Typography variant="body2" color="text.secondary">
            Min: {data.min.toFixed(3)}ms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            •
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Max: {data.max.toFixed(3)}ms
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};