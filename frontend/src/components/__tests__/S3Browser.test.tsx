import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import S3Browser from '../S3Browser';
import { S3Service } from '../../services/s3Service';
import { useAuth } from '../../hooks/useAuth';
import { S3Bucket, S3Object } from '../../types/s3';

// Mock the dependencies
vi.mock('../../services/s3Service');
vi.mock('../../hooks/useAuth');

const mockS3Service = vi.mocked(S3Service);
const mockUseAuth = vi.mocked(useAuth);

// Mock data
const mockBuckets: S3Bucket[] = [
  { name: 'test-bucket-1', creationDate: new Date('2024-01-01') },
  { name: 'test-bucket-2', creationDate: new Date('2024-01-02') },
];

const mockObjects: S3Object[] = [
  {
    key: 'logs/2024/01/01/access.log',
    size: 1024,
    lastModified: new Date('2024-01-01T10:00:00Z'),
    etag: 'etag1',
    storageClass: 'STANDARD',
  },
  {
    key: 'logs/2024/01/01/error.log.gz',
    size: 2048,
    lastModified: new Date('2024-01-01T11:00:00Z'),
    etag: 'etag2',
    storageClass: 'STANDARD',
  },
  {
    key: 'logs/2024/01/02/access.log',
    size: 1536,
    lastModified: new Date('2024-01-02T10:00:00Z'),
    etag: 'etag3',
    storageClass: 'STANDARD',
  },
];

describe('S3Browser', () => {
  const mockOnFilesSelected = vi.fn();
  const mockOnSearchCriteriaChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default auth state
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      credentials: null,
      sessionToken: 'test-token',
      loading: false,
      error: null,
    });

    // Default S3Service mocks
    mockS3Service.listBuckets.mockResolvedValue(mockBuckets);
    mockS3Service.listObjects.mockResolvedValue(mockObjects);
    mockS3Service.searchLogFiles.mockResolvedValue(mockObjects);
    mockS3Service.formatFileSize.mockImplementation((bytes: number) => `${bytes} bytes`);
    mockS3Service.isLikelyLogFile.mockImplementation((key: string) => 
      key.includes('.log') || key.includes('.gz')
    );
    mockS3Service.getFileName.mockImplementation((key: string) => 
      key.split('/').pop() || key
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('shows authentication warning when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        credentials: null,
        sessionToken: null,
        loading: false,
        error: null,
      });

      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      expect(screen.getByText(/please authenticate with aws credentials/i)).toBeInTheDocument();
    });

    it('loads buckets when authenticated', async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(mockS3Service.listBuckets).toHaveBeenCalled();
      });
    });
  });

  describe('Bucket Selection', () => {
    it('renders bucket selection dropdown', async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      expect(select).toHaveValue('');
      
      // Check if buckets are loaded
      await waitFor(() => {
        expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
        expect(screen.getByText('test-bucket-2')).toBeInTheDocument();
      });
    });

    it('loads objects when bucket is selected', async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(mockS3Service.listObjects).toHaveBeenCalledWith('test-bucket-1', '');
      });
    });
  });

  describe('Object Display', () => {
    beforeEach(async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(mockS3Service.listObjects).toHaveBeenCalled();
      });
    });

    it('displays objects in the current folder', async () => {
      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
        expect(screen.getByText('error.log.gz')).toBeInTheDocument();
      });
    });

    it('shows file metadata', async () => {
      await waitFor(() => {
        expect(screen.getByText('1024 bytes')).toBeInTheDocument();
        expect(screen.getByText('2048 bytes')).toBeInTheDocument();
      });
    });

    it('displays folders for navigation', async () => {
      await waitFor(() => {
        // Should show 'logs' folder
        expect(screen.getByText('logs/')).toBeInTheDocument();
      });
    });
  });

  describe('File Selection', () => {
    beforeEach(async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(mockS3Service.listObjects).toHaveBeenCalled();
      });
    });

    it('allows single file selection', async () => {
      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
      });

      const fileItem = screen.getByText('access.log').closest('.object-item');
      expect(fileItem).toBeInTheDocument();
      
      await userEvent.click(fileItem!);

      expect(mockOnFilesSelected).toHaveBeenCalledWith([mockObjects[0]]);
    });

    it('allows multiple file selection', async () => {
      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
        expect(screen.getByText('error.log.gz')).toBeInTheDocument();
      });

      const file1 = screen.getByText('access.log').closest('.object-item');
      const file2 = screen.getByText('error.log.gz').closest('.object-item');
      
      await userEvent.click(file1!);
      await userEvent.click(file2!);

      expect(mockOnFilesSelected).toHaveBeenLastCalledWith([mockObjects[0], mockObjects[1]]);
    });

    it('shows selection count', async () => {
      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
      });

      const fileItem = screen.getByText('access.log').closest('.object-item');
      await userEvent.click(fileItem!);

      await waitFor(() => {
        expect(screen.getByText('1 file(s) selected')).toBeInTheDocument();
      });
    });

    it('allows clearing selection', async () => {
      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
      });

      const fileItem = screen.getByText('access.log').closest('.object-item');
      await userEvent.click(fileItem!);

      await waitFor(() => {
        expect(screen.getByText('Clear Selection')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear Selection');
      await userEvent.click(clearButton);

      expect(mockOnFilesSelected).toHaveBeenLastCalledWith([]);
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} onSearchCriteriaChange={mockOnSearchCriteriaChange} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(mockS3Service.listObjects).toHaveBeenCalled();
      });
    });

    it('shows search criteria inputs', async () => {
      await waitFor(() => {
        expect(screen.getByLabelText(/prefix/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/file extensions/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/recursive search/i)).toBeInTheDocument();
      });
    });

    it('updates search criteria', async () => {
      const prefixInput = screen.getByLabelText(/prefix/i);
      await userEvent.clear(prefixInput);
      await userEvent.type(prefixInput, 'logs/2024/');

      expect(mockOnSearchCriteriaChange).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'logs/2024/' })
      );
    });

    it('performs search when search button is clicked', async () => {
      const searchButton = screen.getByText('Search');
      await userEvent.click(searchButton);

      await waitFor(() => {
        expect(mockS3Service.searchLogFiles).toHaveBeenCalledWith(
          'test-bucket-1',
          expect.objectContaining({
            recursive: false,
            fileExtensions: ['.log', '.gz', '.txt'],
          })
        );
      });
    });

    it('toggles recursive search', async () => {
      const recursiveCheckbox = screen.getByLabelText(/recursive search/i);
      await userEvent.click(recursiveCheckbox);

      expect(mockOnSearchCriteriaChange).toHaveBeenCalledWith(
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('Navigation', () => {
    beforeEach(async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(mockS3Service.listObjects).toHaveBeenCalled();
      });
    });

    it('shows breadcrumb navigation', async () => {
      await waitFor(() => {
        expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
      });
    });

    it('navigates to folders', async () => {
      await waitFor(() => {
        expect(screen.getByText('logs/')).toBeInTheDocument();
      });

      const folderLink = screen.getByText('logs/');
      await userEvent.click(folderLink);

      await waitFor(() => {
        expect(mockS3Service.listObjects).toHaveBeenCalledWith('test-bucket-1', 'logs');
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error when bucket loading fails', async () => {
      mockS3Service.listBuckets.mockRejectedValue(new Error('Failed to load buckets'));

      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load buckets/i)).toBeInTheDocument();
      });
    });

    it('displays error when object loading fails', async () => {
      mockS3Service.listObjects.mockRejectedValue(new Error('Failed to load objects'));

      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(screen.getByText(/failed to load objects/i)).toBeInTheDocument();
      });
    });

    it('allows dismissing error messages', async () => {
      mockS3Service.listBuckets.mockRejectedValue(new Error('Failed to load buckets'));

      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load buckets/i)).toBeInTheDocument();
      });

      const closeButton = screen.getByLabelText('Close');
      await userEvent.click(closeButton);

      expect(screen.queryByText(/failed to load buckets/i)).not.toBeInTheDocument();
    });
  });

  describe('Props Configuration', () => {
    it('respects maxSelections prop', async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} maxSelections={1} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
        expect(screen.getByText('error.log.gz')).toBeInTheDocument();
      });

      const file1 = screen.getByText('access.log').closest('.object-item');
      const file2 = screen.getByText('error.log.gz').closest('.object-item');
      
      await userEvent.click(file1!);
      await userEvent.click(file2!);

      await waitFor(() => {
        expect(screen.getByText(/maximum 1 files can be selected/i)).toBeInTheDocument();
      });
    });

    it('handles single selection mode', async () => {
      render(<S3Browser onFilesSelected={mockOnFilesSelected} allowMultipleSelection={false} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(screen.getByText('access.log')).toBeInTheDocument();
      });

      const fileItem = screen.getByText('access.log').closest('.object-item');
      await userEvent.click(fileItem!);

      expect(mockOnFilesSelected).toHaveBeenCalledWith([mockObjects[0]]);
    });

    it('uses initial search criteria', async () => {
      const initialCriteria = {
        prefix: 'logs/',
        recursive: true,
        fileExtensions: ['.log'],
      };

      render(
        <S3Browser 
          onFilesSelected={mockOnFilesSelected} 
          searchCriteria={initialCriteria}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      await waitFor(() => {
        expect(screen.getByDisplayValue('logs/')).toBeInTheDocument();
        expect(screen.getByDisplayValue('.log')).toBeInTheDocument();
        expect(screen.getByLabelText(/recursive search/i)).toBeChecked();
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner when loading buckets', async () => {
      let resolvePromise: () => void;
      mockS3Service.listBuckets.mockImplementation(() => new Promise((resolve) => {
        resolvePromise = () => resolve(mockBuckets);
      }));

      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      // Wait for the loading state to appear
      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('disables controls while loading', async () => {
      mockS3Service.listObjects.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/select bucket/i);
      await userEvent.selectOptions(select, 'test-bucket-1');

      expect(select).toBeDisabled();
    });
  });
});