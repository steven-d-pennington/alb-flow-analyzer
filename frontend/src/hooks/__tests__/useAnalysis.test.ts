import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAnalysis } from '../useAnalysis';
import { analysisService } from '../../services/analysisService';
import { AnalysisResult, FilterCriteria } from '../../types/analysis';

// Mock the analysis service
vi.mock('../../services/analysisService');

const mockAnalysisResult: AnalysisResult = {
  metrics: {
    totalRequests: 1000,
    requestsPerMinute: [],
    requestsPerHour: [],
    peakPeriods: [],
    responseTimePercentiles: {
      p50: 50,
      p90: 100,
      p95: 150,
      p99: 200,
      average: 75,
      min: 10,
      max: 500
    },
    statusCodeDistribution: [],
    endpointStats: [],
    userAgentStats: []
  },
  filteredEntryCount: 1000,
  totalEntryCount: 1000,
  processingTime: 1500,
  lastUpdated: new Date('2023-12-03T14:30:00Z')
};

describe('useAnalysis', () => {
  const mockGetAnalysisResults = vi.fn();
  const mockApplyFilters = vi.fn();

  beforeEach(() => {
    vi.mocked(analysisService.getAnalysisResults).mockImplementation(mockGetAnalysisResults);
    vi.mocked(analysisService.applyFilters).mockImplementation(mockApplyFilters);
    
    mockGetAnalysisResults.mockResolvedValue(mockAnalysisResult);
    mockApplyFilters.mockResolvedValue(mockAnalysisResult);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with correct default values', () => {
    const { result } = renderHook(() => useAnalysis());

    expect(result.current.analysisResult).toBeNull();
    expect(result.current.isLoading).toBe(true); // Should be loading initially
    expect(result.current.error).toBeNull();
    expect(result.current.filters).toEqual({});
  });

  it('fetches analysis data on mount', async () => {
    const { result } = renderHook(() => useAnalysis());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetAnalysisResults).toHaveBeenCalledTimes(1);
    expect(result.current.analysisResult).toEqual(mockAnalysisResult);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error correctly', async () => {
    const errorMessage = 'Failed to fetch data';
    mockGetAnalysisResults.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useAnalysis());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.analysisResult).toBeNull();
  });

  it('applies filters correctly', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const testFilters: FilterCriteria = {
      endpoints: ['/api/users'],
      statusCodes: [200, 404]
    };

    await act(async () => {
      await result.current.applyFilters(testFilters);
    });

    expect(mockApplyFilters).toHaveBeenCalledWith(testFilters);
    expect(result.current.filters).toEqual(testFilters);
  });

  it('refreshes data with current filters', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Apply some filters first
    const testFilters: FilterCriteria = {
      endpoints: ['/api/users']
    };

    await act(async () => {
      await result.current.applyFilters(testFilters);
    });

    // Clear the mock calls from applying filters
    vi.clearAllMocks();

    // Now refresh
    await act(async () => {
      await result.current.refreshData();
    });

    expect(mockApplyFilters).toHaveBeenCalledWith(testFilters);
  });

  it('clears filters correctly', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Apply some filters first
    const testFilters: FilterCriteria = {
      endpoints: ['/api/users']
    };

    await act(async () => {
      await result.current.applyFilters(testFilters);
    });

    expect(result.current.filters).toEqual(testFilters);

    // Clear the mock calls
    vi.clearAllMocks();

    // Now clear filters
    await act(async () => {
      await result.current.clearFilters();
    });

    expect(result.current.filters).toEqual({});
    expect(mockGetAnalysisResults).toHaveBeenCalledTimes(1);
  });

  it('sets loading state correctly during operations', async () => {
    let resolvePromise: (value: AnalysisResult) => void;
    const pendingPromise = new Promise<AnalysisResult>((resolve) => {
      resolvePromise = resolve;
    });

    mockGetAnalysisResults.mockReturnValue(pendingPromise);

    const { result } = renderHook(() => useAnalysis());

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);

    // Resolve the promise
    act(() => {
      resolvePromise!(mockAnalysisResult);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('handles apply filters error correctly', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const errorMessage = 'Failed to apply filters';
    mockApplyFilters.mockRejectedValue(new Error(errorMessage));

    const testFilters: FilterCriteria = {
      endpoints: ['/api/users']
    };

    await act(async () => {
      await result.current.applyFilters(testFilters);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.filters).toEqual(testFilters); // Filters should still be set
  });

  it('handles refresh data error correctly', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const errorMessage = 'Failed to refresh data';
    mockGetAnalysisResults.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      await result.current.refreshData();
    });

    expect(result.current.error).toBe(errorMessage);
  });

  it('uses getAnalysisResults when no filters are applied', async () => {
    const { result } = renderHook(() => useAnalysis());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetAnalysisResults).toHaveBeenCalledTimes(1);
    expect(mockApplyFilters).not.toHaveBeenCalled();
  });

  it('uses applyFilters when filters are applied', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const testFilters: FilterCriteria = {
      timeRange: {
        start: new Date('2023-12-01'),
        end: new Date('2023-12-02')
      }
    };

    await act(async () => {
      await result.current.applyFilters(testFilters);
    });

    expect(mockApplyFilters).toHaveBeenCalledWith(testFilters);
  });

  it('handles non-Error objects in catch blocks', async () => {
    mockGetAnalysisResults.mockRejectedValue('String error');

    const { result } = renderHook(() => useAnalysis());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('An unknown error occurred');
  });

  it('maintains filter state across operations', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const testFilters: FilterCriteria = {
      endpoints: ['/api/users'],
      statusCodes: [200]
    };

    // Apply filters
    await act(async () => {
      await result.current.applyFilters(testFilters);
    });

    expect(result.current.filters).toEqual(testFilters);

    // Refresh should maintain the same filters
    await act(async () => {
      await result.current.refreshData();
    });

    expect(result.current.filters).toEqual(testFilters);
  });
});