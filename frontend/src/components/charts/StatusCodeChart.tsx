import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { StatusCodeStats } from '../../types/analysis';

interface StatusCodeChartProps {
  data: StatusCodeStats[];
  height?: number;
}

const STATUS_CODE_COLORS: Record<string, string> = {
  '2xx': '#4caf50', // Green for success
  '3xx': '#ff9800', // Orange for redirects
  '4xx': '#f44336', // Red for client errors
  '5xx': '#9c27b0', // Purple for server errors
  'other': '#607d8b' // Blue grey for others
};

const getStatusCodeCategory = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return 'other';
};

export const StatusCodeChart: React.FC<StatusCodeChartProps> = ({
  data,
  height = 300
}) => {
  const chartData = data.map(item => ({
    name: `${item.statusCode}`,
    value: item.count,
    percentage: item.percentage,
    category: getStatusCodeCategory(item.statusCode)
  }));

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: 1,
            padding: 1,
            boxShadow: 2
          }}
        >
          <Typography variant="body2">
            Status Code: {data.name}
          </Typography>
          <Typography variant="body2">
            Count: {data.value.toLocaleString()}
          </Typography>
          <Typography variant="body2">
            Percentage: {data.percentage.toFixed(2)}%
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ name, percentage }: any) => {
    return percentage > 5 ? `${name} (${percentage.toFixed(1)}%)` : '';
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Status Code Distribution
        </Typography>
        <Box height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={STATUS_CODE_COLORS[entry.category]} 
                  />
                ))}
              </Pie>
              <Tooltip content={renderCustomTooltip} />
              <Legend 
                formatter={(value, entry: any) => (
                  <span style={{ color: entry.color }}>
                    {value} ({entry.payload.percentage.toFixed(1)}%)
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};