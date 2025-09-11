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
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Storage,
  ArrowBack,
  ArrowForward
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import S3Browser from '../components/S3Browser';
import CredentialManager from '../components/CredentialManager';
import { AWSCredentials, S3Object } from '../types';
import { downloadService } from '../services/downloadService';
import { formatBytes } from '../utils/formatters';

const steps = ['Browse S3', 'Download', 'Analysis'];

export const S3BrowsePage: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  // const [credentials, setCredentials] = useState<AWSCredentials | null>(null);
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<S3Object[]>([]);
  const [currentBucket, setCurrentBucket] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  // const [batchId, setBatchId] = useState<string | null>(null);

  const handleCredentialsValidated = (validatedCredentials: AWSCredentials) => {
    // setCredentials(validatedCredentials);
    setShowCredentialForm(false);
    console.log('Credentials validated:', validatedCredentials);
  };

  const handleFilesSelected = (files: S3Object[]) => {
    setSelectedFiles(files);
  };

  const handleBucketSelected = (bucketName: string | null) => {
    setCurrentBucket(bucketName);
  };

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) return;

    setActiveStep(1);
    setIsProcessing(true);
    setProcessingError(null);

    try {
      if (!currentBucket) {
        throw new Error('No bucket selected');
      }

      // Skip estimate step for faster workflow - go straight to download
      const s3FilePaths = selectedFiles.map(file => `s3://${currentBucket}/${file.key}`);
      
      // Create download request without estimating first
      const downloadRequest = {
        s3FilePaths,
        batchName: `S3 Download ${new Date().toLocaleString()}`,
        estimateOnly: false
      };

      // Start download
      const downloadBatchId = await downloadService.startDownload(downloadRequest);
      // setBatchId(downloadBatchId);

      // Poll for completion
      await pollDownloadStatus(downloadBatchId);

    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : 'Download failed');
      setIsProcessing(false);
    }
  };

  const pollDownloadStatus = async (downloadBatchId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const progress = await downloadService.getDownloadProgress(downloadBatchId);
        
        if (progress.status === 'completed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          setActiveStep(2);
          // Navigate to local files page after download completes
          // User can then manually process the batch from there
          setTimeout(() => {
            navigate('/local-files');
          }, 2000);
        } else if (progress.status === 'error') {
          clearInterval(pollInterval);
          setProcessingError('Download failed');
          setIsProcessing(false);
        } else if (progress.status === 'cancelled') {
          clearInterval(pollInterval);
          setProcessingError('Download was cancelled');
          setIsProcessing(false);
        }
      } catch (error) {
        clearInterval(pollInterval);
        setProcessingError(error instanceof Error ? error.message : 'Status check failed');
        setIsProcessing(false);
      }
    }, 2000);

    // Cleanup after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isProcessing) {
        setProcessingError('Download timeout - please check the Local Files page');
        setIsProcessing(false);
      }
    }, 600000);
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    // setCredentials(null);
    setSelectedFiles([]);
    setIsProcessing(false);
    setProcessingError(null);
    setDownloadEstimate(null);
    // setBatchId(null);
  };


  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            {showCredentialForm ? (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  AWS credentials are required to access S3. Please enter your credentials below.
                </Alert>
                <CredentialManager
                  onCredentialsValidated={handleCredentialsValidated}
                  showTitle={false}
                />
              </Box>
            ) : (
              <S3Browser
                onFilesSelected={handleFilesSelected}
                onBucketSelected={handleBucketSelected}
                searchCriteria={{
                  fileExtensions: ['.log', '.txt', '.gz', '.gzip'],
                  recursive: true
                }}
                onError={(error) => {
                  // If the error suggests authentication issues, show credential form
                  if (error.toLowerCase().includes('unauthorized') || 
                      error.toLowerCase().includes('credentials') ||
                      error.toLowerCase().includes('auth')) {
                    setShowCredentialForm(true);
                  }
                }}
              />
            )}
            
            {selectedFiles.length > 0 && (
              <Paper sx={{ p: 2, mt: 3, bgcolor: 'grey.50' }}>
                <Typography variant="h6" gutterBottom>
                  Selected Files ({selectedFiles.length})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  {selectedFiles.slice(0, 5).map((file, index) => (
                    <Chip
                      key={index}
                      label={`${file.key.split('/').pop()} (${formatBytes(file.size)})`}
                      variant="outlined"
                      size="small"
                    />
                  ))}
                  {selectedFiles.length > 5 && (
                    <Chip
                      label={`+${selectedFiles.length - 5} more`}
                      variant="outlined"
                      size="small"
                      color="primary"
                    />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Total size: {formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
                </Typography>
              </Paper>
            )}
          </Box>
        );
      case 1:
        return (
          <Box textAlign="center" py={4}>
            <CircularProgress size={60} />
            <Typography variant="h6" mt={2}>
              Downloading S3 Files...
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected from S3
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total size: {formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
            </Typography>
          </Box>
        );
      case 2:
        return (
          <Box textAlign="center" py={4}>
            <Storage sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Download Complete!
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Your S3 ALB flow logs have been downloaded. Redirecting to Local Files page...
            </Typography>
            <Button
              variant="contained"
              startIcon={<Storage />}
              onClick={() => navigate('/local-files')}
            >
              View Downloaded Files
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
        <Storage sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Browse S3 for ALB Flow Logs
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
              Browse More Files
            </Button>
          ) : activeStep === 0 ? (
            <Button
              variant="contained"
              disabled={selectedFiles.length === 0}
              onClick={handleProcessFiles}
            >
              Download Selected Files
              <ArrowForward sx={{ ml: 1 }} />
            </Button>
          ) : (
            <Button
              disabled={isProcessing}
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

export default S3BrowsePage;