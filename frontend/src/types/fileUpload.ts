export interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  acceptedTypes: string[];
  maxFileSize: number;
  multiple: boolean;
  disabled?: boolean;
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface FileValidationError {
  file: File;
  error: string;
  type: 'size' | 'type' | 'unknown';
}

export interface FileUploadState {
  isDragActive: boolean;
  uploadProgress: UploadProgress[];
  validationErrors: FileValidationError[];
  isUploading: boolean;
}