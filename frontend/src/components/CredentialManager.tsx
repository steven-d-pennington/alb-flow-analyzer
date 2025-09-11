import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  InputAdornment,
  Collapse,
  Chip,
  Stack,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error,
  Info,
  Logout,
  Refresh,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { AWSCredentials } from '../types/auth';

const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

interface CredentialManagerProps {
  onCredentialsValidated?: (credentials: AWSCredentials) => void;
  showTitle?: boolean;
  compact?: boolean;
}

const CredentialManager: React.FC<CredentialManagerProps> = ({
  onCredentialsValidated,
  showTitle = true,
  compact = false,
}) => {
  const {
    isAuthenticated,
    credentials,
    loading,
    error,
    login,
    logout,
    testCredentials,
    clearError,
  } = useAuth();

  const [formData, setFormData] = useState<AWSCredentials>({
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
    region: 'us-east-1',
  });

  const [showSecrets, setShowSecrets] = useState({
    secretAccessKey: false,
    sessionToken: false,
  });

  const [validationState, setValidationState] = useState<{
    testing: boolean;
    tested: boolean;
    valid: boolean;
  }>({
    testing: false,
    tested: false,
    valid: false,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Clear error when form changes
  useEffect(() => {
    if (error) {
      clearError();
    }
  }, [formData, clearError]);

  // Call callback when credentials are validated
  useEffect(() => {
    if (isAuthenticated && credentials && onCredentialsValidated) {
      onCredentialsValidated(credentials);
    }
  }, [isAuthenticated, credentials, onCredentialsValidated]);

  const handleInputChange = (field: keyof AWSCredentials) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
    
    // Reset validation state when form changes
    setValidationState(prev => ({
      ...prev,
      tested: false,
      valid: false,
    }));
  };

  const handleRegionChange = (event: any) => {
    setFormData(prev => ({
      ...prev,
      region: event.target.value,
    }));
  };

  const toggleSecretVisibility = (field: 'secretAccessKey' | 'sessionToken') => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleTestCredentials = async () => {
    if (!formData.accessKeyId || !formData.secretAccessKey) {
      return;
    }

    setValidationState({ testing: true, tested: false, valid: false });

    try {
      const isValid = await testCredentials(formData);
      setValidationState({
        testing: false,
        tested: true,
        valid: isValid,
      });
    } catch (error) {
      setValidationState({
        testing: false,
        tested: true,
        valid: false,
      });
    }
  };

  const handleLogin = async () => {
    if (!formData.accessKeyId || !formData.secretAccessKey) {
      return;
    }

    const success = await login(formData);
    
    if (success) {
      // Clear form for security
      setFormData({
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
        region: formData.region,
      });
      setValidationState({ testing: false, tested: false, valid: false });
    }
  };

  const handleLogout = async () => {
    await logout();
    setFormData({
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
      region: 'us-east-1',
    });
    setValidationState({ testing: false, tested: false, valid: false });
  };

  const isFormValid = formData.accessKeyId && formData.secretAccessKey && formData.region;

  if (isAuthenticated && credentials) {
    return (
      <Card sx={{ mb: compact ? 1 : 2 }}>
        <CardContent sx={{ p: compact ? 2 : 3 }}>
          {showTitle && (
            <Typography variant={compact ? 'h6' : 'h5'} gutterBottom>
              AWS Credentials
            </Typography>
          )}
          
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <CheckCircle color="success" />
            <Typography variant="body1" color="success.main">
              Authenticated as {credentials.accessKeyId.substring(0, 8)}...
            </Typography>
            <Chip 
              label={credentials.region.toUpperCase()} 
              size="small" 
              color="primary" 
              variant="outlined" 
            />
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<Logout />}
              onClick={handleLogout}
              disabled={loading}
              size={compact ? 'small' : 'medium'}
            >
              Logout
            </Button>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => window.location.reload()}
              size={compact ? 'small' : 'medium'}
            >
              Refresh
            </Button>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: compact ? 1 : 2 }}>
      <CardContent sx={{ p: compact ? 2 : 3 }}>
        {showTitle && (
          <Typography variant={compact ? 'h6' : 'h5'} gutterBottom>
            AWS Credentials
          </Typography>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your AWS credentials to access S3 buckets and analyze ALB flow logs.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" noValidate>
          <TextField
            fullWidth
            label="Access Key ID"
            value={formData.accessKeyId}
            onChange={handleInputChange('accessKeyId')}
            margin="normal"
            required
            placeholder="AKIA..."
            helperText="Your AWS Access Key ID"
            size={compact ? 'small' : 'medium'}
          />

          <TextField
            fullWidth
            label="Secret Access Key"
            type={showSecrets.secretAccessKey ? 'text' : 'password'}
            value={formData.secretAccessKey}
            onChange={handleInputChange('secretAccessKey')}
            margin="normal"
            required
            placeholder="Enter your secret access key"
            helperText="Your AWS Secret Access Key"
            size={compact ? 'small' : 'medium'}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => toggleSecretVisibility('secretAccessKey')}
                    edge="end"
                  >
                    {showSecrets.secretAccessKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <FormControl fullWidth margin="normal" size={compact ? 'small' : 'medium'}>
            <InputLabel>AWS Region</InputLabel>
            <Select
              value={formData.region}
              onChange={handleRegionChange}
              label="AWS Region"
            >
              {AWS_REGIONS.map((region) => (
                <MenuItem key={region.value} value={region.value}>
                  {region.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="text"
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{ mt: 1, mb: 1 }}
            size="small"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </Button>

          <Collapse in={showAdvanced}>
            <TextField
              fullWidth
              label="Session Token (Optional)"
              type={showSecrets.sessionToken ? 'text' : 'password'}
              value={formData.sessionToken}
              onChange={handleInputChange('sessionToken')}
              margin="normal"
              placeholder="For temporary credentials"
              helperText="Optional: For temporary AWS credentials"
              size={compact ? 'small' : 'medium'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => toggleSecretVisibility('sessionToken')}
                      edge="end"
                    >
                      {showSecrets.sessionToken ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Security Note:</strong> Credentials are stored securely in your browser's local storage 
                and are never sent to our servers except for validation.
              </Typography>
            </Alert>
          </Collapse>

          {validationState.tested && (
            <Alert 
              severity={validationState.valid ? 'success' : 'error'} 
              sx={{ mt: 2 }}
              icon={validationState.valid ? <CheckCircle /> : <Error />}
            >
              {validationState.valid 
                ? 'Credentials are valid and can access AWS services'
                : 'Credentials are invalid or lack necessary permissions'
              }
            </Alert>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              onClick={handleTestCredentials}
              disabled={!isFormValid || validationState.testing || loading}
              startIcon={validationState.testing ? <CircularProgress size={16} /> : <Info />}
              size={compact ? 'small' : 'medium'}
            >
              Test Credentials
            </Button>

            <Button
              variant="contained"
              onClick={handleLogin}
              disabled={!isFormValid || loading}
              startIcon={loading ? <CircularProgress size={16} /> : <CheckCircle />}
              size={compact ? 'small' : 'medium'}
            >
              {loading ? 'Validating...' : 'Connect'}
            </Button>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CredentialManager;