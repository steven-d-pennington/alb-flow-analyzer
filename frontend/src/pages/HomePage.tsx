import React from 'react'
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
  ListItemText
} from '@mui/material'
import { 
  CloudUpload, 
  Analytics, 
  FilterList, 
  GetApp,
  Storage,
  Assessment
} from '@mui/icons-material'

const HomePage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h3" component="h1" gutterBottom align="center">
        ALB Flow Log Analyzer
      </Typography>
      
      <Typography variant="h6" component="p" gutterBottom align="center" color="text.secondary" sx={{ mb: 4 }}>
        Analyze AWS Application Load Balancer flow logs and generate realistic load test configurations
      </Typography>

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
                <strong>Note:</strong> The application is currently in development. 
                Core functionality will be implemented in subsequent development phases.
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Supported features (coming soon):
                </Typography>
                <List dense>
                  <ListItem sx={{ py: 0 }}>
                    <Typography variant="body2">• AWS credential management</Typography>
                  </ListItem>
                  <ListItem sx={{ py: 0 }}>
                    <Typography variant="body2">• S3 bucket browsing</Typography>
                  </ListItem>
                  <ListItem sx={{ py: 0 }}>
                    <Typography variant="body2">• Real-time log processing</Typography>
                  </ListItem>
                  <ListItem sx={{ py: 0 }}>
                    <Typography variant="body2">• Interactive analytics dashboard</Typography>
                  </ListItem>
                </List>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          System Status
        </Typography>
        <Typography variant="body2" color="success.main">
          ✅ Project structure initialized
        </Typography>
        <Typography variant="body2" color="text.secondary">
          🔄 Backend API endpoints - In development
        </Typography>
        <Typography variant="body2" color="text.secondary">
          🔄 Database integration - In development
        </Typography>
        <Typography variant="body2" color="text.secondary">
          🔄 AWS services integration - In development
        </Typography>
      </Paper>
    </Box>
  )
}

export default HomePage