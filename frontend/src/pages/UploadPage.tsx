import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload,
  Assessment,
  ArrowBack,
  ArrowForward
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import FileUpload from '../components/FileUpload';
import CredentialManager from '../components/CredentialManager';
import { AWSCredentials } from '../types';

const steps = ['AWS Credentials', 'Upload Files', 'Processing', 'Analysis'];

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [credentials, setCredentials] = useState<AWSCredentials | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const handleCredentialsValidated = (validatedCredentials: AWSCredentials) => {
    setCredentials(validatedCredentials);
    setActiveStep(1);
  };

  const handleFilesSelected = (files: File[]) => {
    setUploadedFiles(files);
    if (files.length > 0) {
      setActiveStep(2);
      startProcessing(files);
    }
  };

  const startProcessing = async (files: File[]) => {
    setIsProcessing(true);
    setProcessingError(null);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      // Upload files
      const uploadResponse = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload files');
      }

      const uploadResult = await uploadResponse.json();
      const filePaths = uploadResult.files.map((file: any) => file.path);

      // Start processing
      const processResponse = await fetch('/api/files/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filePaths,
          options: {
            batchSize: 1000,
            skipMalformedLines: true
          }
        })
      });

      if (!processResponse.ok) {
        throw new Error('Failed to start processing');
      }

      const processResult = await processResponse.json();
      const sessionId = processResult.sessionId;

      // Poll for completion
      await pollProcessingStatus(sessionId);

    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : 'Processing failed');
      setIsProcessing(false);
    }
  };

  const pollProcessingStatus = async (sessionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/files/progress/${sessionId}`);
        if (!response.ok) {
          throw new Error('Failed to get processing status');
        }

        const status = await response.json();
        
        if (status.isComplete) {
          clearInterval(pollInterval);
          setIsProcessing(false);
          
          if (status.error) {
            setProcessingError(status.error);
          } else {
            setActiveStep(3);
            // Navigate to dashboard after a short delay
            setTimeout(() => {
              navigate('/dashboard');
            }, 2000);
          }
        }
      } catch (error) {
        clearInterval(pollInterval);
        setProcessingError(error instanceof Error ? error.message : 'Status check failed');
        setIsProcessing(false);
      }
    }, 2000);

    // Cleanup after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isProcessing) {
        setProcessingError('Processing timeout - please check the dashboard');
        setIsProcessing(false);
      }
    }, 300000);
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    setCredentials(null);
    setUploadedFiles([]);
    setIsProcessing(false);
    setProcessingError(null);
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <CredentialManager
            onCredentialsValidated={handleCredentialsValidated}
            showTitle={false}
          />
        );
      case 1:
        return (
          <FileUpload
            onFilesSelected={handleFilesSelected}
            acceptedTypes={['.log', '.txt', '.gz', '.gzip']}
            maxFileSize={1024 * 1024 * 1024} // 1GB
            multiple={true}
          />
        );
      case 2:
        return (
          <Box textAlign="center" py={4}>
            <CircularProgress size={60} />
            <Typography variant="h6" mt={2}>
              Processing ALB Flow Logs...
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded
            </Typography>
          </Box>
        );
      case 3:
        return (
          <Box textAlign="center" py={4}>
            <Assessment sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Processing Complete!
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Your ALB flow logs have been analyzed. Redirecting to dashboard...
            </Typography>
            <Button
              variant="contained"
              startIcon={<Assessment />}
              onClick={() => navigate('/dashboard')}
            >
              View Analysis
            </Button>
          </Box>
        );
      default:
        return 'Unknown step';
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/')}
          sx={{ mr: 2 }}
        >
          Back to Home
        </Button>
        <CloudUpload sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Upload ALB Flow Logs
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {processingError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {processingError}
          </Alert>
        )}

        <Box sx={{ minHeight: 400 }}>
          {getStepContent(activeStep)}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
          <Button
            color="inherit"
            disabled={activeStep === 0 || isProcessing}
            onClick={handleBack}
            sx={{ mr: 1 }}
          >
            Back
          </Button>
          <Box sx={{ flex: '1 1 auto' }} />
          {activeStep === steps.length - 1 ? (
            <Button onClick={handleReset}>
              Upload More Files
            </Button>
          ) : (
            <Button
              disabled={
                (activeStep === 0 && !credentials) ||
                (activeStep === 1 && uploadedFiles.length === 0) ||
                isProcessing
              }
            >
              {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
              <ArrowForward sx={{ ml: 1 }} />
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default UploadPage;