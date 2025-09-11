import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { vi } from 'vitest';
import CredentialManager from '../CredentialManager';
import { useAuth } from '../../hooks/useAuth';

// Mock the useAuth hook
vi.mock('../../hooks/useAuth');
const mockUseAuth = vi.mocked(useAuth);

// Mock theme for tests
const theme = createTheme();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={theme}>
    {children}
  </ThemeProvider>
);

describe('CredentialManager', () => {
  const mockAuthState = {
    isAuthenticated: false,
    credentials: null,
    sessionToken: null,
    loading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    testCredentials: vi.fn(),
    clearError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(mockAuthState);
  });

  describe('Unauthenticated State', () => {
    it('renders credential form when not authenticated', () => {
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      expect(screen.getByText('AWS Credentials')).toBeInTheDocument();
      expect(screen.getByLabelText(/Access Key ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Secret Access Key/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument(); // Just check that the Select exists
      expect(screen.getAllByText('AWS Region')[0]).toBeInTheDocument(); // Check that the label exists
      expect(screen.getByRole('button', { name: /Test Credentials/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Connect/i })).toBeInTheDocument();
    });

    it('shows validation helper text', () => {
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      expect(screen.getByText('Your AWS Access Key ID')).toBeInTheDocument();
      expect(screen.getByText('Your AWS Secret Access Key')).toBeInTheDocument();
    });

    it('allows toggling password visibility', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const secretKeyInput = screen.getByLabelText(/Secret Access Key/i);
      const toggleButton = screen.getAllByRole('button')[0]; // First visibility toggle

      expect(secretKeyInput).toHaveAttribute('type', 'password');

      await act(async () => {
        await user.click(toggleButton);
      });
      expect(secretKeyInput).toHaveAttribute('type', 'text');

      await act(async () => {
        await user.click(toggleButton);
      });
      expect(secretKeyInput).toHaveAttribute('type', 'password');
    });

    it('shows advanced options when toggled', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const advancedButton = screen.getByRole('button', { name: /Show Advanced Options/i });
      
      await act(async () => {
        await user.click(advancedButton);
      });

      expect(screen.getByLabelText(/Session Token/i)).toBeInTheDocument();
      expect(screen.getByText(/Security Note/i)).toBeInTheDocument();
    });

    it('disables buttons when form is invalid', () => {
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const testButton = screen.getByRole('button', { name: /Test Credentials/i });
      const connectButton = screen.getByRole('button', { name: /Connect/i });

      expect(testButton).toBeDisabled();
      expect(connectButton).toBeDisabled();
    });

    it('enables buttons when form is valid', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const accessKeyInput = screen.getByLabelText(/Access Key ID/i);
      const secretKeyInput = screen.getByLabelText(/Secret Access Key/i);

      await act(async () => {
        await user.type(accessKeyInput, 'AKIAIOSFODNN7EXAMPLE');
        await user.type(secretKeyInput, 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      });

      const testButton = screen.getByRole('button', { name: /Test Credentials/i });
      const connectButton = screen.getByRole('button', { name: /Connect/i });

      expect(testButton).not.toBeDisabled();
      expect(connectButton).not.toBeDisabled();
    });

    it('calls testCredentials when test button is clicked', async () => {
      const user = userEvent.setup();
      const mockTestCredentials = vi.fn().mockResolvedValue(true);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthState,
        testCredentials: mockTestCredentials,
      });

      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const accessKeyInput = screen.getByLabelText(/Access Key ID/i);
      const secretKeyInput = screen.getByLabelText(/Secret Access Key/i);
      const testButton = screen.getByRole('button', { name: /Test Credentials/i });

      await act(async () => {
        await user.type(accessKeyInput, 'AKIAIOSFODNN7EXAMPLE');
        await user.type(secretKeyInput, 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
        await user.click(testButton);
      });

      expect(mockTestCredentials).toHaveBeenCalledWith({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: '',
        region: 'us-east-1',
      });
    });

    it('calls login when connect button is clicked', async () => {
      const user = userEvent.setup();
      const mockLogin = vi.fn().mockResolvedValue(true);
      
      mockUseAuth.mockReturnValue({
        ...mockAuthState,
        login: mockLogin,
      });

      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const accessKeyInput = screen.getByLabelText(/Access Key ID/i);
      const secretKeyInput = screen.getByLabelText(/Secret Access Key/i);
      const connectButton = screen.getByRole('button', { name: /Connect/i });

      await act(async () => {
        await user.type(accessKeyInput, 'AKIAIOSFODNN7EXAMPLE');
        await user.type(secretKeyInput, 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
        await user.click(connectButton);
      });

      expect(mockLogin).toHaveBeenCalledWith({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: '',
        region: 'us-east-1',
      });
    });

    it('displays error message when present', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthState,
        error: 'Invalid credentials',
      });

      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    it('shows loading state', () => {
      mockUseAuth.mockReturnValue({
        ...mockAuthState,
        loading: true,
      });

      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      expect(screen.getByText('Validating...')).toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    const mockCredentials = {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    };

    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        ...mockAuthState,
        isAuthenticated: true,
        credentials: mockCredentials,
        sessionToken: 'mock-session-token',
      });
    });

    it('shows authenticated state', () => {
      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      expect(screen.getByText(/Authenticated as AKIAIOSF.../)).toBeInTheDocument();
      expect(screen.getByText('US-EAST-1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Logout/i })).toBeInTheDocument();
    });

    it('calls logout when logout button is clicked', async () => {
      const user = userEvent.setup();
      const mockLogout = vi.fn();
      
      mockUseAuth.mockReturnValue({
        ...mockAuthState,
        isAuthenticated: true,
        credentials: mockCredentials,
        logout: mockLogout,
      });

      render(
        <TestWrapper>
          <CredentialManager />
        </TestWrapper>
      );

      const logoutButton = screen.getByRole('button', { name: /Logout/i });
      
      await act(async () => {
        await user.click(logoutButton);
      });

      expect(mockLogout).toHaveBeenCalled();
    });

    it('calls onCredentialsValidated callback when authenticated', () => {
      const mockCallback = vi.fn();
      
      render(
        <TestWrapper>
          <CredentialManager onCredentialsValidated={mockCallback} />
        </TestWrapper>
      );

      expect(mockCallback).toHaveBeenCalledWith(mockCredentials);
    });
  });

  describe('Compact Mode', () => {
    it('renders in compact mode', () => {
      render(
        <TestWrapper>
          <CredentialManager compact showTitle={false} />
        </TestWrapper>
      );

      // Should still render the form but without title
      expect(screen.queryByText('AWS Credentials')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Access Key ID/i)).toBeInTheDocument();
    });
  });
});