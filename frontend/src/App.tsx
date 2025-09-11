import { FC, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Container, AppBar, Toolbar, Typography, Box, Button } from '@mui/material'
import { Assessment, Home, CloudUpload, Storage, Timeline, Folder } from '@mui/icons-material'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import S3BrowsePage from './pages/S3BrowsePage'
import LocalFilesPage from './pages/LocalFilesPage'
import { AnalysisDashboard } from './components'
import WorkflowDashboard from './components/WorkflowDashboard'
import { ProgressPanel } from './components/ProgressPanel'
import { AuthService } from './services/authService'

const App: FC = () => {
  const location = useLocation()

  // Initialize environment session if available
  useEffect(() => {
    const initializeAuth = async () => {
      // Check if we already have a session token
      const existingToken = localStorage.getItem('aws_session_token');
      if (existingToken) {
        return; // Already authenticated
      }

      // Try to get environment session from server
      try {
        console.log('Checking for environment credentials on server...');
        const envSessionToken = await AuthService.getEnvironmentSession();
        if (envSessionToken) {
          localStorage.setItem('aws_session_token', envSessionToken);
          console.log('Environment session initialized successfully');
        }
      } catch (error) {
        console.log('No environment credentials available');
      }
    };

    initializeAuth();
  }, []);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            ALB Flow Analyzer
          </Typography>
          
          <Button
            color="inherit"
            component={Link}
            to="/"
            startIcon={<Home />}
            sx={{ 
              mr: 1,
              backgroundColor: location.pathname === '/' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Home
          </Button>
          
          <Button
            color="inherit"
            component={Link}
            to="/upload"
            startIcon={<CloudUpload />}
            sx={{ 
              mr: 1,
              backgroundColor: location.pathname === '/upload' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Upload
          </Button>
          
          <Button
            color="inherit"
            component={Link}
            to="/s3-browse"
            startIcon={<Storage />}
            sx={{ 
              mr: 1,
              backgroundColor: location.pathname === '/s3-browse' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            S3 Browse
          </Button>
          
          <Button
            color="inherit"
            component={Link}
            to="/dashboard"
            startIcon={<Assessment />}
            sx={{ 
              mr: 1,
              backgroundColor: location.pathname === '/dashboard' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Dashboard
          </Button>
          
          <Button
            color="inherit"
            component={Link}
            to="/local-files"
            startIcon={<Folder />}
            sx={{ 
              mr: 1,
              backgroundColor: location.pathname === '/local-files' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Local Files
          </Button>
          
          <Button
            color="inherit"
            component={Link}
            to="/workflow"
            startIcon={<Timeline />}
            sx={{ 
              backgroundColor: location.pathname === '/workflow' ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
          >
            Workflow
          </Button>
        </Toolbar>
      </AppBar>
      
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/s3-browse" element={<S3BrowsePage />} />
          <Route path="/local-files" element={<LocalFilesPage />} />
          <Route path="/dashboard" element={<AnalysisDashboard />} />
          <Route path="/workflow" element={<WorkflowDashboard />} />
          <Route path="*" element={
            <Typography variant="h4" align="center" sx={{ mt: 8 }}>
              Page Not Found
            </Typography>
          } />
        </Routes>
      </Container>
      
      {/* Fixed progress panel for real-time updates */}
      <ProgressPanel position="fixed" />
    </Box>
  )
}

export default App