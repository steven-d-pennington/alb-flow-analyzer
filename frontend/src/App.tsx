import { FC } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Container, AppBar, Toolbar, Typography, Box } from '@mui/material'
import HomePage from './pages/HomePage'

const App: FC = () => {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            ALB Flow Analyzer
          </Typography>
        </Toolbar>
      </AppBar>
      
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={
            <Typography variant="h4" align="center" sx={{ mt: 8 }}>
              Page Not Found
            </Typography>
          } />
        </Routes>
      </Container>
    </Box>
  )
}

export default App