import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { TimeSeries } from '../../types/analysis';
import { format } from 'date-fns';

interface TrafficChartProps {
  data: TimeSeries[];
  title: string;
  timeFormat?: string;
  height?: number;
}

export const TrafficChart: React.FC<TrafficChartProps> = ({
  data,
  title,
  timeFormat = 'HH:mm',
  height = 300
}) => {
  const chartData = data.map(item => ({
    time: format(item.timestamp, timeFormat),
    requests: item.value,
    timestamp: item.timestamp
  }));

  const formatTooltipLabel = (label: string, payload: any[]) => {
    if (payload && payload.length > 0) {
      const timestamp = payload[0]?.payload?.timestamp;
      if (timestamp) {
        return format(new Date(timestamp), 'MMM dd, yyyy HH:mm:ss');
      }
    }
    return label;
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Box height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                labelFormatter={formatTooltipLabel}
                formatter={(value: number) => [value, 'Requests']}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="requests"
                stroke="#1976d2"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="Requests"
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};