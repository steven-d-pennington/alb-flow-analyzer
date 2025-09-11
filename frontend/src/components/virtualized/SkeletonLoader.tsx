import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Paper,
  Skeleton,
  Typography,
  styled,
  alpha,
} from '@mui/material';

const AnimatedSkeleton = styled(Skeleton)(({ theme }) => ({
  '&::after': {
    animationDuration: '1.2s',
  },
}));

const SkeletonCard = styled(Card)(({ theme }) => ({
  '& .MuiCardContent-root': {
    padding: theme.spacing(2),
  },
}));

interface SkeletonLoaderProps {
  variant: 'card' | 'list' | 'table' | 'chart' | 'dashboard' | 'text' | 'custom';
  count?: number;
  height?: number | string;
  width?: number | string;
  children?: React.ReactNode;
  sx?: any;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant,
  count = 1,
  height,
  width,
  children,
  sx,
}) => {
  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <SkeletonCard sx={{ height, width, ...sx }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <AnimatedSkeleton variant="circular" width={24} height={24} />
                <AnimatedSkeleton variant="text" width="40%" height={24} />
              </Box>
              <AnimatedSkeleton variant="rectangular" width="100%" height={60} sx={{ mb: 2 }} />
              <AnimatedSkeleton variant="text" width="80%" />
              <AnimatedSkeleton variant="text" width="60%" />
            </CardContent>
          </SkeletonCard>
        );

      case 'list':
        return (
          <Box sx={{ width, height, ...sx }}>
            {Array.from({ length: count }).map((_, index) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
                <AnimatedSkeleton variant="circular" width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <AnimatedSkeleton variant="text" width="60%" />
                  <AnimatedSkeleton variant="text" width="40%" />
                </Box>
                <AnimatedSkeleton variant="rectangular" width={60} height={20} />
              </Box>
            ))}
          </Box>
        );

      case 'table':
        return (
          <Box sx={{ width, height, ...sx }}>
            {/* Table Header */}
            <Box sx={{ display: 'flex', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <AnimatedSkeleton key={index} variant="text" width={`${100/4}%`} />
              ))}
            </Box>
            {/* Table Rows */}
            {Array.from({ length: count }).map((_, rowIndex) => (
              <Box key={rowIndex} sx={{ display: 'flex', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
                {Array.from({ length: 4 }).map((_, colIndex) => (
                  <AnimatedSkeleton key={colIndex} variant="text" width={`${100/4}%`} />
                ))}
              </Box>
            ))}
          </Box>
        );

      case 'chart':
        return (
          <Paper sx={{ p: 2, height, width, ...sx }}>
            <AnimatedSkeleton variant="text" width="40%" height={24} sx={{ mb: 2 }} />
            <AnimatedSkeleton
              variant="rectangular"
              width="100%"
              height={height ? `calc(${typeof height === 'number' ? `${height}px` : height} - 60px)` : 300}
            />
          </Paper>
        );

      case 'dashboard':
        return (
          <Box sx={{ width, height, ...sx }}>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
              <AnimatedSkeleton variant="text" width="30%" height={40} sx={{ mb: 1 }} />
              <AnimatedSkeleton variant="text" width="50%" height={20} />
            </Box>

            {/* Metric Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Grid item xs={12} sm={6} md={3} key={index}>
                  <SkeletonCard>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <AnimatedSkeleton variant="circular" width={24} height={24} />
                        <AnimatedSkeleton variant="text" width="60%" />
                      </Box>
                      <AnimatedSkeleton variant="text" width="40%" height={32} />
                    </CardContent>
                  </SkeletonCard>
                </Grid>
              ))}
            </Grid>

            {/* Charts */}
            <Grid container spacing={3}>
              <Grid item xs={12} lg={8}>
                <Paper sx={{ p: 2 }}>
                  <AnimatedSkeleton variant="text" width="40%" height={24} sx={{ mb: 2 }} />
                  <AnimatedSkeleton variant="rectangular" width="100%" height={350} />
                </Paper>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Paper sx={{ p: 2 }}>
                  <AnimatedSkeleton variant="text" width="50%" height={24} sx={{ mb: 2 }} />
                  <AnimatedSkeleton variant="rectangular" width="100%" height={350} />
                </Paper>
              </Grid>
            </Grid>
          </Box>
        );

      case 'text':
        return (
          <Box sx={{ width, height, ...sx }}>
            {Array.from({ length: count }).map((_, index) => (
              <AnimatedSkeleton key={index} variant="text" width="100%" sx={{ mb: 1 }} />
            ))}
          </Box>
        );

      case 'custom':
        return children ? <Box sx={{ width, height, ...sx }}>{children}</Box> : null;

      default:
        return <AnimatedSkeleton variant="rectangular" width={width} height={height} sx={sx} />;
    }
  };

  return <>{renderSkeleton()}</>;
};

// Specialized skeleton components
export const DashboardSkeleton: React.FC<{ height?: number }> = ({ height = 600 }) => (
  <SkeletonLoader variant="dashboard" height={height} />
);

export const ChartSkeleton: React.FC<{ height?: number; title?: boolean }> = ({ 
  height = 300, 
  title = true 
}) => (
  <Paper sx={{ p: 2 }}>
    {title && <AnimatedSkeleton variant="text" width="40%" height={24} sx={{ mb: 2 }} />}
    <AnimatedSkeleton variant="rectangular" width="100%" height={height} />
  </Paper>
);

export const TableSkeleton: React.FC<{ 
  rows?: number; 
  columns?: number; 
  height?: number;
}> = ({ 
  rows = 10, 
  columns = 4, 
  height = 400 
}) => (
  <Paper sx={{ height }}>
    {/* Header */}
    <Box sx={{ display: 'flex', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
      {Array.from({ length: columns }).map((_, index) => (
        <AnimatedSkeleton key={index} variant="text" width={`${100/columns}%`} />
      ))}
    </Box>
    {/* Rows */}
    <Box sx={{ maxHeight: height - 60, overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Box key={rowIndex} sx={{ display: 'flex', gap: 2, p: 2, borderBottom: 1, borderColor: 'divider' }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <AnimatedSkeleton key={colIndex} variant="text" width={`${100/columns}%`} />
          ))}
        </Box>
      ))}
    </Box>
  </Paper>
);

export const CardGridSkeleton: React.FC<{ 
  count?: number;
  columns?: number;
}> = ({ count = 6, columns = 3 }) => (
  <Grid container spacing={3}>
    {Array.from({ length: count }).map((_, index) => (
      <Grid item xs={12} sm={6} md={12 / columns} key={index}>
        <SkeletonLoader variant="card" />
      </Grid>
    ))}
  </Grid>
);

export const MetricCardSkeleton: React.FC = () => (
  <SkeletonCard>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <AnimatedSkeleton variant="circular" width={32} height={32} />
        <Box sx={{ flex: 1 }}>
          <AnimatedSkeleton variant="text" width="60%" />
        </Box>
      </Box>
      <AnimatedSkeleton variant="text" width="40%" height={32} />
      <AnimatedSkeleton variant="text" width="30%" />
    </CardContent>
  </SkeletonCard>
);

export const ListItemSkeleton: React.FC = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
    <AnimatedSkeleton variant="circular" width={40} height={40} />
    <Box sx={{ flex: 1 }}>
      <AnimatedSkeleton variant="text" width="60%" />
      <AnimatedSkeleton variant="text" width="40%" />
    </Box>
    <AnimatedSkeleton variant="rectangular" width={60} height={20} />
  </Box>
);

export default SkeletonLoader;