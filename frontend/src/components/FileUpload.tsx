import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Chip,
  Paper,
} from '@mui/material';
import {
  CloudUpload,
  InsertDriveFile,
  Error as ErrorIcon,
  CheckCircle,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { FileUploadProps, UploadProgress, FileValidationError } from '../types';

const FileUpload: React.FC<FileUploadProps> = ({
  onFilesSelected,
  acceptedTypes,
  maxFileSize,
  multiple,
  disabled = false,
}) => {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);

  const validateFile = useCallback((file: File): FileValidationError | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return {
        file,
        error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxFileSize)})`,
        type: 'size',
      };
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = acceptedTypes.some(type => {
      if (type.startsWith('.')) {
        return type.toLowerCase() === fileExtension;
      }
      return file.type === type;
    });

    if (!isValidType) {
      return {
        file,
        error: `File type not supported. Accepted types: ${acceptedTypes.join(', ')}`,
        type: 'type',
      };
    }

    return null;
  }, [acceptedTypes, maxFileSize]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    const errors: FileValidationError[] = [];
    const validFiles: File[] = [];

    // Process accepted files
    acceptedFiles.forEach(file => {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
      } else {
        validFiles.push(file);
      }
    });

    // Process rejected files
    rejectedFiles.forEach(({ file, errors: dropzoneErrors }) => {
      const error = dropzoneErrors[0];
      errors.push({
        file,
        error: error.message,
        type: 'unknown',
      });
    });

    setValidationErrors(errors);

    if (validFiles.length > 0) {
      // Initialize progress tracking
      const progressItems: UploadProgress[] = validFiles.map(file => ({
        file,
        progress: 0,
        status: 'pending',
      }));
      setUploadProgress(progressItems);

      // Simulate upload progress (in real implementation, this would be actual upload)
      progressItems.forEach((item, index) => {
        simulateUploadProgress(item, index);
      });

      onFilesSelected(validFiles);
    }
  }, [validateFile, onFilesSelected]);

  const simulateUploadProgress = (item: UploadProgress, index: number) => {
    const updateProgress = (progress: number) => {
      setUploadProgress(prev => 
        prev.map(p => 
          p.file === item.file 
            ? { ...p, progress, status: progress === 100 ? 'completed' : 'uploading' }
            : p
        )
      );
    };

    // Simulate progressive upload
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      updateProgress(progress);
    }, 200 + index * 100); // Stagger uploads
  };

  const removeFile = useCallback((file: File) => {
    setUploadProgress(prev => prev.filter(p => p.file !== file));
    setValidationErrors(prev => prev.filter(e => e.file !== file));
  }, []);

  const clearErrors = useCallback(() => {
    setValidationErrors([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes.reduce((acc, type) => {
      if (type.startsWith('.')) {
        // File extension
        acc[`application/*`] = [type];
      } else {
        // MIME type
        acc[type] = [];
      }
      return acc;
    }, {} as Record<string, string[]>),
    multiple,
    disabled,
    maxSize: maxFileSize,
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'uploading':
      case 'pending':
      default:
        return <InsertDriveFile color="primary" />;
    }
  };

  return (
    <Box>
      {/* Drop Zone */}
      <Paper
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.300',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: disabled ? 'grey.300' : 'primary.main',
            backgroundColor: disabled ? 'background.paper' : 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive
            ? 'Drop the files here...'
            : 'Drag & drop files here, or click to select'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {multiple ? 'You can select multiple files' : 'Select a single file'}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          {acceptedTypes.map(type => (
            <Chip key={type} label={type} size="small" variant="outlined" />
          ))}
        </Box>
        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
          Maximum file size: {formatFileSize(maxFileSize)}
        </Typography>
      </Paper>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert 
            severity="error" 
            onClose={clearErrors}
            sx={{ mb: 1 }}
          >
            {validationErrors.length} file(s) failed validation
          </Alert>
          <List dense>
            {validationErrors.map((error, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  <ErrorIcon color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={error.file.name}
                  secondary={error.error}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            Upload Progress
          </Typography>
          <List>
            {uploadProgress.map((item, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  {getStatusIcon(item.status)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box component="span" sx={{ flexGrow: 1 }}>
                        {item.file.name}
                      </Box>
                      <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {formatFileSize(item.file.size)}
                      </Box>
                    </Box>
                  }
                  secondary={
                    <React.Fragment>
                      <LinearProgress
                        variant="determinate"
                        value={item.progress}
                        sx={{ mt: 1, mb: 0.5 }}
                      />
                      <Typography variant="caption" component="div">
                        {item.status === 'completed' 
                          ? 'Upload completed' 
                          : `${Math.round(item.progress)}%`
                        }
                      </Typography>
                    </React.Fragment>
                  }
                />
                <IconButton
                  edge="end"
                  onClick={() => removeFile(item.file)}
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
};

export default FileUpload;