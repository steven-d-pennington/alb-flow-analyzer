import React, { useState } from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { FileUpload } from '../index';

const FileUploadExample: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    console.log('Files selected:', files);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        ALB Flow Log File Upload
      </Typography>
      
      <Typography variant="body1" sx={{ mb: 3 }}>
        Upload your AWS Application Load Balancer flow log files for analysis.
        Supported formats include .log, .gz, and .txt files up to 100MB each.
      </Typography>

      <FileUpload
        onFilesSelected={handleFilesSelected}
        acceptedTypes={['.log', '.gz', '.txt']}
        maxFileSize={100 * 1024 * 1024} // 100MB
        multiple={true}
      />

      {selectedFiles.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="success">
            Successfully selected {selectedFiles.length} file(s) for processing:
            <ul>
              {selectedFiles.map((file, index) => (
                <li key={index}>
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </li>
              ))}
            </ul>
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default FileUploadExample;