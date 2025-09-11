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
import { EndpointStats } from '../../types/analysis';

interface EndpointChartProps {
  data: EndpointStats[];
  height?: number;
  maxEndpoints?: number;
}

export const EndpointChart: React.FC<EndpointChartProps> = ({
  data,
  height = 300,
  maxEndpoints = 10
}) => {
  // Sort by request count and take top N endpoints
  const sortedData = [...data]
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, maxEndpoints);

  const chartData = sortedData.map(item => ({
    endpoint: item.endpoint.length > 30 
      ? `...${item.endpoint.slice(-27)}` 
      : item.endpoint,
    fullEndpoint: item.endpoint,
    requests: item.requestCount,
    percentage: item.percentage,
    avgResponseTime: item.averageResponseTime,
    errorRate: item.errorRate
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
            padding: 2,
            boxShadow: 2,
            maxWidth: 300
          }}
        >
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            {data.fullEndpoint}
          </Typography>
          <Typography variant="body2">
            Requests: {data.requests.toLocaleString()}
          </Typography>
          <Typography variant="body2">
            Percentage: {data.percentage.toFixed(2)}%
          </Typography>
          <Typography variant="body2">
            Avg Response Time: {data.avgResponseTime.toFixed(3)}ms
          </Typography>
          <Typography variant="body2">
            Error Rate: {data.errorRate.toFixed(2)}%
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Top Endpoints by Request Count
        </Typography>
        <Box height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              layout="horizontal"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <YAxis 
                type="category"
                dataKey="endpoint"
                tick={{ fontSize: 10 }}
                width={120}
              />
              <Tooltip content={renderCustomTooltip} />
              <Bar 
                dataKey="requests" 
                fill="#1976d2"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        {data.length > maxEndpoints && (
          <Typography variant="body2" color="text.secondary" mt={1}>
            Showing top {maxEndpoints} of {data.length} endpoints
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};