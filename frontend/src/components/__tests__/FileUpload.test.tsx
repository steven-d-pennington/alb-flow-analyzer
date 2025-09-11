import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import FileUpload from '../FileUpload';

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(),
}));

import { useDropzone } from 'react-dropzone';
const mockUseDropzone = vi.mocked(useDropzone);

describe('FileUpload Component', () => {
  const defaultProps = {
    onFilesSelected: vi.fn(),
    acceptedTypes: ['.log', '.gz', '.txt'],
    maxFileSize: 100 * 1024 * 1024, // 100MB
    multiple: true,
  };

  const mockDropzoneProps = {
    getRootProps: () => ({
      'data-testid': 'dropzone',
    }),
    getInputProps: () => ({
      'data-testid': 'file-input',
    }),
    isDragActive: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDropzone.mockReturnValue(mockDropzoneProps);
  });

  it('renders the file upload component', () => {
    render(<FileUpload {...defaultProps} />);
    
    expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument();
    expect(screen.getByText(/you can select multiple files/i)).toBeInTheDocument();
    expect(screen.getByText(/maximum file size: 100 mb/i)).toBeInTheDocument();
  });

  it('displays accepted file types as chips', () => {
    render(<FileUpload {...defaultProps} />);
    
    expect(screen.getByText('.log')).toBeInTheDocument();
    expect(screen.getByText('.gz')).toBeInTheDocument();
    expect(screen.getByText('.txt')).toBeInTheDocument();
  });

  it('shows single file message when multiple is false', () => {
    render(<FileUpload {...defaultProps} multiple={false} />);
    
    expect(screen.getByText(/select a single file/i)).toBeInTheDocument();
  });

  it('applies disabled styling when disabled', () => {
    render(<FileUpload {...defaultProps} disabled={true} />);
    
    const dropzone = screen.getByTestId('dropzone');
    expect(dropzone).toHaveStyle({ opacity: '0.6' });
  });

  it('shows drag active state', () => {
    mockUseDropzone.mockReturnValue({
      ...mockDropzoneProps,
      isDragActive: true,
    });

    render(<FileUpload {...defaultProps} />);
    
    expect(screen.getByText(/drop the files here/i)).toBeInTheDocument();
  });

  it('handles file validation - valid files', async () => {
    const validFile = new File(['content'], 'test.log', { type: 'text/plain' });
    const onFilesSelected = vi.fn();

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      // Simulate the onDrop callback
      setTimeout(() => onDrop([validFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} onFilesSelected={onFilesSelected} />);

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalledWith([validFile]);
    });
  });

  it('handles file validation - file too large', async () => {
    const largeFile = new File(['content'], 'large.log', { 
      type: 'text/plain' 
    });
    Object.defineProperty(largeFile, 'size', { value: 200 * 1024 * 1024 });

    const onFilesSelected = vi.fn();

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([largeFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} onFilesSelected={onFilesSelected} />);

    await waitFor(() => {
      expect(screen.getByText(/file size.*exceeds maximum/i)).toBeInTheDocument();
      expect(onFilesSelected).not.toHaveBeenCalled();
    });
  });

  it('handles file validation - invalid file type', async () => {
    const invalidFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([invalidFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/file type not supported/i)).toBeInTheDocument();
    });
  });

  it('displays upload progress for valid files', async () => {
    const validFile = new File(['content'], 'test.log', { type: 'text/plain' });

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([validFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Upload Progress')).toBeInTheDocument();
      expect(screen.getByText('test.log')).toBeInTheDocument();
    });
  });

  it('allows removing files from upload list', async () => {
    const validFile = new File(['content'], 'test.log', { type: 'text/plain' });

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([validFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('test.log')).toBeInTheDocument();
    });

    const deleteButton = screen.getByTestId('DeleteIcon').closest('button');
    fireEvent.click(deleteButton!);

    await waitFor(() => {
      expect(screen.queryByText('test.log')).not.toBeInTheDocument();
    });
  });

  it('clears validation errors when close button is clicked', async () => {
    const invalidFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([invalidFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/file type not supported/i)).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(/file type not supported/i)).not.toBeInTheDocument();
    });
  });

  it('handles multiple files correctly', async () => {
    const file1 = new File(['content1'], 'test1.log', { type: 'text/plain' });
    const file2 = new File(['content2'], 'test2.log', { type: 'text/plain' });
    const onFilesSelected = vi.fn();

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([file1, file2], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} onFilesSelected={onFilesSelected} />);

    await waitFor(() => {
      expect(screen.getByText('test1.log')).toBeInTheDocument();
      expect(screen.getByText('test2.log')).toBeInTheDocument();
      expect(onFilesSelected).toHaveBeenCalledWith([file1, file2]);
    });
  });

  it('handles mixed valid and invalid files', async () => {
    const validFile = new File(['content'], 'valid.log', { type: 'text/plain' });
    const invalidFile = new File(['content'], 'invalid.pdf', { type: 'application/pdf' });
    const onFilesSelected = vi.fn();

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([validFile, invalidFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} onFilesSelected={onFilesSelected} />);

    await waitFor(() => {
      // Valid file should be in upload progress
      expect(screen.getByText('valid.log')).toBeInTheDocument();
      // Invalid file should be in errors
      expect(screen.getByText(/file type not supported/i)).toBeInTheDocument();
      // Only valid file should be passed to callback
      expect(onFilesSelected).toHaveBeenCalledWith([validFile]);
    });
  });

  it('formats file sizes correctly', () => {
    render(<FileUpload {...defaultProps} maxFileSize={1024 * 1024} />);
    
    expect(screen.getByText(/maximum file size: 1 mb/i)).toBeInTheDocument();
  });

  it('shows upload progress with percentage', async () => {
    const validFile = new File(['content'], 'test.log', { type: 'text/plain' });

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([validFile], []), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} />);

    // Wait for progress to start
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  it('passes correct props to useDropzone', () => {
    render(<FileUpload {...defaultProps} />);

    expect(mockUseDropzone).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: true,
        disabled: false,
        maxSize: 100 * 1024 * 1024,
        accept: expect.any(Object),
        onDrop: expect.any(Function),
      })
    );
  });

  it('handles rejected files from dropzone', async () => {
    const rejectedFile = new File(['content'], 'rejected.log', { type: 'text/plain' });
    const rejectedFiles = [{
      file: rejectedFile,
      errors: [{ message: 'File rejected by dropzone', code: 'file-invalid-type' }]
    }];

    mockUseDropzone.mockImplementation(({ onDrop }) => {
      setTimeout(() => onDrop([], rejectedFiles), 0);
      return mockDropzoneProps;
    });

    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/file rejected by dropzone/i)).toBeInTheDocument();
    });
  });
});