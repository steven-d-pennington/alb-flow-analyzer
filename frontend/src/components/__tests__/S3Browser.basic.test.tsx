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
    key: 'access.log',
    size: 1024,
    lastModified: new Date('2024-01-01T10:00:00Z'),
    etag: 'etag1',
    storageClass: 'STANDARD',
  },
  {
    key: 'error.log.gz',
    size: 2048,
    lastModified: new Date('2024-01-01T11:00:00Z'),
    etag: 'etag2',
    storageClass: 'STANDARD',
  },
];

describe('S3Browser Basic Tests', () => {
  const mockOnFilesSelected = vi.fn();

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

  it('renders without crashing', () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);
    expect(screen.getByText('S3 Browser')).toBeInTheDocument();
  });

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

  it('renders bucket selection dropdown', async () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/select bucket/i)).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    expect(select).toHaveValue('');
  });

  it('shows search criteria inputs when bucket is selected', async () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    await userEvent.selectOptions(select, 'test-bucket-1');

    await waitFor(() => {
      expect(screen.getByLabelText(/prefix/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/file extensions/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/recursive search/i)).toBeInTheDocument();
    });
  });

  it('displays objects when bucket is selected', async () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    await userEvent.selectOptions(select, 'test-bucket-1');

    await waitFor(() => {
      expect(mockS3Service.listObjects).toHaveBeenCalledWith('test-bucket-1', '');
    });

    await waitFor(() => {
      expect(screen.getByText((content, element) => 
        element?.textContent?.includes('access.log') || false
      )).toBeInTheDocument();
      expect(screen.getByText((content, element) => 
        element?.textContent?.includes('error.log.gz') || false
      )).toBeInTheDocument();
    });
  });

  it('allows file selection', async () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    await userEvent.selectOptions(select, 'test-bucket-1');

    await waitFor(() => {
      expect(screen.getByText((content, element) => 
        element?.textContent?.includes('access.log') || false
      )).toBeInTheDocument();
    });

    const fileItem = screen.getByText((content, element) => 
      element?.textContent?.includes('access.log') || false
    ).closest('.file-item');
    expect(fileItem).toBeInTheDocument();
    
    await userEvent.click(fileItem!);

    expect(mockOnFilesSelected).toHaveBeenCalledWith([mockObjects[0]]);
  });

  it('shows selection count', async () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    await userEvent.selectOptions(select, 'test-bucket-1');

    await waitFor(() => {
      expect(screen.getByText((content, element) => 
        element?.textContent?.includes('access.log') || false
      )).toBeInTheDocument();
    });

    const fileItem = screen.getByText((content, element) => 
      element?.textContent?.includes('access.log') || false
    ).closest('.file-item');
    await userEvent.click(fileItem!);

    await waitFor(() => {
      expect(screen.getByText('1 file(s) selected')).toBeInTheDocument();
    });
  });

  it('handles search functionality', async () => {
    const mockOnSearchCriteriaChange = vi.fn();
    render(
      <S3Browser 
        onFilesSelected={mockOnFilesSelected} 
        onSearchCriteriaChange={mockOnSearchCriteriaChange}
      />
    );

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    await userEvent.selectOptions(select, 'test-bucket-1');

    await waitFor(() => {
      expect(screen.getByLabelText(/prefix/i)).toBeInTheDocument();
    });

    const prefixInput = screen.getByLabelText(/prefix/i);
    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, 'logs/2024/');

    expect(mockOnSearchCriteriaChange).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'logs/2024/' })
    );
  });

  it('handles error states', async () => {
    mockS3Service.listBuckets.mockRejectedValue(new Error('Failed to load buckets'));

    render(<S3Browser onFilesSelected={mockOnFilesSelected} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load buckets/i)).toBeInTheDocument();
    });
  });

  it('respects maxSelections prop', async () => {
    render(<S3Browser onFilesSelected={mockOnFilesSelected} maxSelections={1} />);

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/select bucket/i);
    await userEvent.selectOptions(select, 'test-bucket-1');

    await waitFor(() => {
      expect(screen.getByText((content, element) => 
        element?.textContent?.includes('access.log') || false
      )).toBeInTheDocument();
      expect(screen.getByText((content, element) => 
        element?.textContent?.includes('error.log.gz') || false
      )).toBeInTheDocument();
    });

    const file1 = screen.getByText((content, element) => 
      element?.textContent?.includes('access.log') || false
    ).closest('.file-item');
    const file2 = screen.getByText((content, element) => 
      element?.textContent?.includes('error.log.gz') || false
    ).closest('.file-item');
    
    await userEvent.click(file1!);
    await userEvent.click(file2!);

    await waitFor(() => {
      expect(screen.getByText(/maximum 1 files can be selected/i)).toBeInTheDocument();
    });
  });

  it('should show Select All buttons when bucket has objects', async () => {
    mockS3Service.listBuckets.mockResolvedValue(mockBuckets);
    mockS3Service.listObjects.mockResolvedValue(mockObjects);

    render(
      <S3Browser
        onFilesSelected={mockOnFilesSelected}
        allowMultipleSelection={true}
      />
    );

    // Wait for buckets to load
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    // Select a bucket
    const bucketSelect = screen.getByRole('combobox');
    await userEvent.selectOptions(bucketSelect, 'test-bucket-1');

    // Wait for objects to load
    await waitFor(() => {
      expect(screen.getByText('Select All Log Files')).toBeInTheDocument();
      expect(screen.getByText('Select All Files')).toBeInTheDocument();
    });
  });

  it('should select all log files when Select All Log Files is clicked', async () => {
    mockS3Service.listBuckets.mockResolvedValue(mockBuckets);
    mockS3Service.listObjects.mockResolvedValue(mockObjects);
    mockS3Service.isLikelyLogFile.mockImplementation((key: string) => 
      key.includes('.log') || key.includes('.gz')
    );

    render(
      <S3Browser
        onFilesSelected={mockOnFilesSelected}
        allowMultipleSelection={true}
      />
    );

    // Wait for buckets to load and select one
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const bucketSelect = screen.getByRole('combobox');
    await userEvent.selectOptions(bucketSelect, 'test-bucket-1');

    // Wait for objects to load
    await waitFor(() => {
      expect(screen.getByText('Select All Log Files')).toBeInTheDocument();
    });

    // Click Select All Log Files
    const selectAllLogFilesButton = screen.getByText('Select All Log Files');
    await userEvent.click(selectAllLogFilesButton);

    // Verify that onFilesSelected was called with log files
    await waitFor(() => {
      expect(mockOnFilesSelected).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'access.log' }),
          expect.objectContaining({ key: 'error.log.gz' })
        ])
      );
    });
  });

  it('should select all files when Select All Files is clicked', async () => {
    mockS3Service.listBuckets.mockResolvedValue(mockBuckets);
    mockS3Service.listObjects.mockResolvedValue([
      ...mockObjects,
      {
        key: 'config.txt',
        size: 512,
        lastModified: new Date('2024-01-01T12:00:00Z'),
        etag: 'etag3',
        storageClass: 'STANDARD',
      }
    ]);

    render(
      <S3Browser
        onFilesSelected={mockOnFilesSelected}
        allowMultipleSelection={true}
      />
    );

    // Wait for buckets to load and select one
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const bucketSelect = screen.getByRole('combobox');
    await userEvent.selectOptions(bucketSelect, 'test-bucket-1');

    // Wait for objects to load
    await waitFor(() => {
      expect(screen.getByText('Select All Files')).toBeInTheDocument();
    });

    // Click Select All Files
    const selectAllFilesButton = screen.getByText('Select All Files');
    await userEvent.click(selectAllFilesButton);

    // Verify that onFilesSelected was called with all files
    await waitFor(() => {
      expect(mockOnFilesSelected).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'access.log' }),
          expect.objectContaining({ key: 'error.log.gz' }),
          expect.objectContaining({ key: 'config.txt' })
        ])
      );
    });
  });

  it('should respect maxSelections when selecting all files', async () => {
    mockS3Service.listBuckets.mockResolvedValue(mockBuckets);
    mockS3Service.listObjects.mockResolvedValue(mockObjects);
    mockS3Service.isLikelyLogFile.mockImplementation((key: string) => 
      key.includes('.log') || key.includes('.gz')
    );

    render(
      <S3Browser
        onFilesSelected={mockOnFilesSelected}
        allowMultipleSelection={true}
        maxSelections={1}
      />
    );

    // Wait for buckets to load and select one
    await waitFor(() => {
      expect(screen.getByText('test-bucket-1')).toBeInTheDocument();
    });

    const bucketSelect = screen.getByRole('combobox');
    await userEvent.selectOptions(bucketSelect, 'test-bucket-1');

    // Wait for objects to load
    await waitFor(() => {
      expect(screen.getByText('Select All Log Files')).toBeInTheDocument();
    });

    // Click Select All Log Files
    const selectAllLogFilesButton = screen.getByText('Select All Log Files');
    await userEvent.click(selectAllLogFilesButton);

    // Verify that only 1 file was selected due to maxSelections
    await waitFor(() => {
      expect(mockOnFilesSelected).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'access.log' })
        ])
      );
      // Should show error message about limit
      expect(screen.getByText(/only selecting first 1 of 2 log files due to limit/i)).toBeInTheDocument();
    });
  });
});