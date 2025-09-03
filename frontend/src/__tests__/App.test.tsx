import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from '../App';

const theme = createTheme();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          {component}
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe('App Component', () => {
  it('renders ALB Flow Analyzer title', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('ALB Flow Analyzer')).toBeInTheDocument();
  });

  it('renders the home page by default', () => {
    renderWithProviders(<App />);
    expect(screen.getByText(/Analyze AWS Application Load Balancer flow logs/)).toBeInTheDocument();
  });
});