import { useState, useEffect, useCallback } from 'react';
import { AnalysisResult, FilterCriteria } from '../types/analysis';
import { analysisService } from '../services/analysisService';

export interface UseAnalysisReturn {
  analysisResult: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  filters: FilterCriteria;
  applyFilters: (newFilters: FilterCriteria) => Promise<void>;
  refreshData: () => Promise<void>;
  clearFilters: () => Promise<void>;
}

export const useAnalysis = (): UseAnalysisReturn => {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterCriteria>({});

  const fetchAnalysisData = useCallback(async (currentFilters: FilterCriteria = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let result: AnalysisResult;
      
      // If no filters are applied, get the base analysis results
      if (Object.keys(currentFilters).length === 0) {
        result = await analysisService.getAnalysisResults();
      } else {
        result = await analysisService.applyFilters(currentFilters);
      }
      
      setAnalysisResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching analysis data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyFilters = useCallback(async (newFilters: FilterCriteria) => {
    setFilters(newFilters);
    await fetchAnalysisData(newFilters);
  }, [fetchAnalysisData]);

  const refreshData = useCallback(async () => {
    await fetchAnalysisData(filters);
  }, [fetchAnalysisData, filters]);

  const clearFilters = useCallback(async () => {
    const emptyFilters: FilterCriteria = {};
    setFilters(emptyFilters);
    await fetchAnalysisData(emptyFilters);
  }, [fetchAnalysisData]);

  // Initial data fetch
  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  return {
    analysisResult,
    isLoading,
    error,
    filters,
    applyFilters,
    refreshData,
    clearFilters
  };
};