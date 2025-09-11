import React, { useState, lazy, Suspense, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { 
  Typography, 
  Paper, 
  Box, 
  Grid, 
  Card, 
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Fade,
  Skeleton,
  Chip,
  LinearProgress,
  Alert
} from '@mui/material'
import { 
  CloudUpload, 
  Analytics, 
  FilterList, 
  GetApp,
  Storage,
  Assessment,
  ArrowForward,
  TrendingUp,
  Speed,
  CheckCircle
} from '@mui/icons-material'
import { CredentialManager } from '../components'
import { AWSCredentials } from '../types'
import { MetricCardSkeleton, CardGridSkeleton } from '../components/virtualized'
import { useInView } from 'react-intersection-observer'

// Lazy load heavy components
const LazyAnalysisDashboard = lazy(() => import('../components/AnalysisDashboard'))
const LazySystemMetrics = lazy(() => import('../components/SystemMetrics'))

const HomePage: React.FC = () => {
  const [credentialsValidated, setCredentialsValidated] = useState(false)
  const [systemMetrics, setSystemMetrics] = useState<any>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  
  // Intersection observer for progressive loading
  const { ref: metricsRef, inView: metricsInView } = useInView({ triggerOnce: true, threshold: 0.1 })
  const { ref: featuresRef, inView: featuresInView } = useInView({ triggerOnce: true, threshold: 0.1 })
  
  const loadSystemMetrics = useCallback(async () => {
    setLoadingMetrics(true)
    try {
      // Simulate API call to get system metrics
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSystemMetrics({
        totalAnalyses: 1247,
        totalLogEntries: 2847391,
        averageProcessingTime: 3.2,
        successRate: 98.5,
        lastAnalysis: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        topEndpoints: [
          { path: '/api/users', requests: 45231, trend: 'up' },
          { path: '/api/orders', requests: 32189, trend: 'up' },
          { path: '/api/products', requests: 28743, trend: 'down' }
        ]
      })
    } catch (error) {
      console.error('Failed to load system metrics:', error)
    } finally {
      setLoadingMetrics(false)
    }
  }, [])
  
  const handleCredentialsValidated = useCallback((credentials: AWSCredentials) => {
    console.log('Credentials validated:', credentials.accessKeyId.substring(0, 8) + '...');
    setCredentialsValidated(true)
    // Load system metrics when credentials are validated
    loadSystemMetrics()
  }, [loadSystemMetrics]);
  
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <Box>
      <Fade in={true} timeout={800}>
        <Box>
          <Typography variant="h3" component="h1" gutterBottom align="center">
            ALB Flow Log Analyzer
          </Typography>
          
          <Typography variant="h6" component="p" gutterBottom align="center" color="text.secondary" sx={{ mb: 4 }}>
            Analyze AWS Application Load Balancer flow logs and generate realistic load test configurations
          </Typography>
        </Box>
      </Fade>

      {/* AWS Credentials Section */}
      <Fade in={true} timeout={1000}>
        <Box>
          <CredentialManager 
            onCredentialsValidated={handleCredentialsValidated}
            showTitle={true}
          />
        </Box>
      </Fade>
      
      {/* System Metrics Section */}
      {credentialsValidated && (
        <div ref={metricsRef}>
          {metricsInView && (
            <Fade in={true} timeout={1200}>
              <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp color="primary" />
                  System Overview
                </Typography>
                {loadingMetrics ? (
                  <Grid container spacing={3}>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Grid item xs={12} sm={6} md={3} key={index}>
                        <MetricCardSkeleton />
                      </Grid>
                    ))}
                  </Grid>
                ) : systemMetrics && (
                  <Grid container spacing={3}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card>
                        <CardContent>
                          <Box display="flex" alignItems="center" gap={2}>
                            <Assessment color="primary" />
                            <Box>
                              <Typography color="text.secondary" gutterBottom>
                                Total Analyses
                              </Typography>
                              <Typography variant="h5">
                                {formatNumber(systemMetrics.totalAnalyses)}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card>
                        <CardContent>
                          <Box display="flex" alignItems="center" gap={2}>
                            <Storage color="primary" />
                            <Box>
                              <Typography color="text.secondary" gutterBottom>
                                Log Entries Processed
                              </Typography>
                              <Typography variant="h5">
                                {formatNumber(systemMetrics.totalLogEntries)}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card>
                        <CardContent>
                          <Box display="flex" alignItems="center" gap={2}>
                            <Speed color="primary" />
                            <Box>
                              <Typography color="text.secondary" gutterBottom>
                                Avg Processing Time
                              </Typography>
                              <Typography variant="h5">
                                {systemMetrics.averageProcessingTime}s
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card>
                        <CardContent>
                          <Box display="flex" alignItems="center" gap={2}>
                            <CheckCircle color="primary" />
                            <Box>
                              <Typography color="text.secondary" gutterBottom>
                                Success Rate
                              </Typography>
                              <Typography variant="h5">
                                {systemMetrics.successRate}%
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                )}
                
                {/* Recent Activity */}
                {systemMetrics && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      Recent Activity
                    </Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Last analysis completed {Math.round((Date.now() - systemMetrics.lastAnalysis.getTime()) / 60000)} minutes ago
                    </Alert>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {systemMetrics.topEndpoints.map((endpoint: any, index: number) => (
                        <Chip
                          key={index}
                          label={`${endpoint.path}: ${formatNumber(endpoint.requests)}`}
                          color={endpoint.trend === 'up' ? 'success' : 'warning'}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </Paper>
            </Fade>
          )}
        </div>
      )}

      <div ref={featuresRef}>
        {featuresInView ? (
          <Fade in={true} timeout={1400}>
            <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h5" component="h2" gutterBottom>
                      <Analytics sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Key Features
                    </Typography>
                    <List>
                      <ListItem>
                        <ListItemIcon>
                          <CloudUpload />
                        </ListItemIcon>
                        <ListItemText 
                          primary="File Upload & S3 Integration" 
                          secondary="Upload local files or browse S3 buckets for ALB flow logs"
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <Assessment />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Traffic Pattern Analysis" 
                          secondary="Analyze request patterns, response times, and peak periods"
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <FilterList />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Advanced Filtering" 
                          secondary="Filter by time range, endpoints, status codes, and client IPs"
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <GetApp />
                        </ListItemIcon>
                        <ListItemText 
                          primary="Export & Load Testing" 
                          secondary="Generate AWS Distributed Load Testing configurations"
                        />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h5" component="h2" gutterBottom>
                      <Storage sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Getting Started
                    </Typography>
                    <Typography variant="body1" paragraph>
                      This application helps you analyze AWS Application Load Balancer flow logs to understand traffic patterns and generate realistic load test scenarios.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Get Started:</strong> Upload your ALB flow logs or browse them directly from S3 to begin analysis.
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Available features:
                      </Typography>
                      <List dense>
                        <ListItem sx={{ py: 0 }}>
                          <Typography variant="body2">• AWS credential management</Typography>
                        </ListItem>
                        <ListItem sx={{ py: 0 }}>
                          <Typography variant="body2">• S3 bucket browsing and file selection</Typography>
                        </ListItem>
                        <ListItem sx={{ py: 0 }}>
                          <Typography variant="body2">• Real-time log processing and analysis</Typography>
                        </ListItem>
                        <ListItem sx={{ py: 0 }}>
                          <Typography variant="body2">• Interactive analytics dashboard</Typography>
                        </ListItem>
                        <ListItem sx={{ py: 0 }}>
                          <Typography variant="body2">• AWS Load Test configuration generation</Typography>
                        </ListItem>
                      </List>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Fade>
        ) : (
          <CardGridSkeleton count={2} columns={2} />
        )}
      </div>

      <Fade in={true} timeout={1600}>
        <Paper sx={{ p: 3, mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            System Status
          </Typography>
          
          {/* System Status with Loading States */}
          <Box sx={{ mb: 3 }}>
            {loadingMetrics && <LinearProgress sx={{ mb: 2 }} />}
            <Typography variant="body2" color="success.main">
              ✅ Project structure initialized
            </Typography>
            <Typography variant="body2" color={credentialsValidated ? "success.main" : "text.secondary"}>
              {credentialsValidated ? "✅" : "⏳"} AWS credential management - {credentialsValidated ? "Connected" : "Available"}
            </Typography>
            <Typography variant="body2" color="success.main">
              ✅ File upload and S3 browsing - Available
            </Typography>
            <Typography variant="body2" color="success.main">
              ✅ ALB flow log parsing and ingestion - Available
            </Typography>
            <Typography variant="body2" color="success.main">
              ✅ Real-time traffic analysis - Available
            </Typography>
            <Typography variant="body2" color="success.main">
              ✅ Analysis Dashboard with real data - Available
            </Typography>
            <Typography variant="body2" color="success.main">
              ✅ AWS Load Test configuration export - Available
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component={Link}
              to="/upload"
              startIcon={<CloudUpload />}
              size="large"
              color="primary"
              disabled={!credentialsValidated}
            >
              Upload Files
            </Button>
            
            <Button
              variant="contained"
              component={Link}
              to="/s3-browse"
              startIcon={<Storage />}
              size="large"
              color="secondary"
              disabled={!credentialsValidated}
            >
              Browse S3
            </Button>
            
            <Button
              variant="outlined"
              component={Link}
              to="/dashboard"
              startIcon={<Assessment />}
              endIcon={<ArrowForward />}
              size="large"
            >
              View Dashboard
            </Button>
          </Box>
          
          {!credentialsValidated && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Please validate your AWS credentials above to enable S3 browsing and file upload features.
            </Alert>
          )}
        </Paper>
      </Fade>
    </Box>
  )
}

export default React.memo(HomePage)