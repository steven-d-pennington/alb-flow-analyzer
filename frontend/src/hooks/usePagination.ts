import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useInfiniteQuery } from 'react-query';

export interface PaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  enableInfiniteScroll?: boolean;
  prefetchNextPage?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface PaginationResult<T> {
  // Data
  data: T[];
  allData: T[];
  isLoading: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  isEmpty: boolean;

  // Pagination state
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;

  // Actions
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  loadMore: () => void;
  refresh: () => void;
  reset: () => void;

  // For infinite scroll
  fetchNextPage: () => void;
  hasNext: boolean;
  isFetchingNextPage: boolean;
}

export function usePagination<T = any>(
  queryKey: string | readonly unknown[],
  queryFn: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  options: PaginationOptions = {}
): PaginationResult<T> {
  const {
    initialPage = 1,
    initialPageSize = 50,
    enableInfiniteScroll = false,
    prefetchNextPage = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 10 * 60 * 1000, // 10 minutes
  } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // For infinite scroll, use useInfiniteQuery
  const infiniteQuery = useInfiniteQuery(
    [queryKey, pageSize],
    ({ pageParam = 1 }) => queryFn(pageParam, pageSize),
    {
      enabled: enableInfiniteScroll,
      getNextPageParam: (lastPage) => {
        return lastPage.pagination.hasNextPage 
          ? lastPage.pagination.page + 1 
          : undefined;
      },
      staleTime,
      cacheTime,
      keepPreviousData: true,
    }
  );

  // For regular pagination, use useQuery
  const paginatedQuery = useQuery(
    [queryKey, currentPage, pageSize],
    () => queryFn(currentPage, pageSize),
    {
      enabled: !enableInfiniteScroll,
      staleTime,
      cacheTime,
      keepPreviousData: true,
    }
  );

  // Choose the appropriate query based on mode
  const query = enableInfiniteScroll ? infiniteQuery : paginatedQuery;

  // Extract data based on query type
  const data = useMemo(() => {
    if (enableInfiniteScroll && infiniteQuery.data) {
      return infiniteQuery.data.pages[infiniteQuery.data.pages.length - 1]?.data || [];
    }
    return paginatedQuery.data?.data || [];
  }, [enableInfiniteScroll, infiniteQuery.data, paginatedQuery.data]);

  // All data for infinite scroll
  const allData = useMemo(() => {
    if (enableInfiniteScroll && infiniteQuery.data) {
      return infiniteQuery.data.pages.flatMap(page => page.data);
    }
    return data;
  }, [enableInfiniteScroll, infiniteQuery.data, data]);

  // Pagination metadata
  const paginationMeta = useMemo(() => {
    if (enableInfiniteScroll && infiniteQuery.data) {
      const lastPage = infiniteQuery.data.pages[infiniteQuery.data.pages.length - 1];
      return lastPage?.pagination;
    }
    return paginatedQuery.data?.pagination;
  }, [enableInfiniteScroll, infiniteQuery.data, paginatedQuery.data]);

  // Actions
  const setPage = useCallback((page: number) => {
    if (!enableInfiniteScroll) {
      setCurrentPage(Math.max(1, page));
    }
  }, [enableInfiniteScroll]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(Math.max(1, size));
    if (!enableInfiniteScroll) {
      setCurrentPage(1); // Reset to first page when changing page size
    }
  }, [enableInfiniteScroll]);

  const nextPage = useCallback(() => {
    if (paginationMeta?.hasNextPage) {
      if (enableInfiniteScroll) {
        infiniteQuery.fetchNextPage();
      } else {
        setCurrentPage(prev => prev + 1);
      }
    }
  }, [enableInfiniteScroll, paginationMeta?.hasNextPage, infiniteQuery]);

  const previousPage = useCallback(() => {
    if (paginationMeta?.hasPreviousPage && !enableInfiniteScroll) {
      setCurrentPage(prev => Math.max(1, prev - 1));
    }
  }, [enableInfiniteScroll, paginationMeta?.hasPreviousPage]);

  const loadMore = useCallback(() => {
    if (enableInfiniteScroll && infiniteQuery.hasNextPage) {
      infiniteQuery.fetchNextPage();
    }
  }, [enableInfiniteScroll, infiniteQuery]);

  const refresh = useCallback(() => {
    if (enableInfiniteScroll) {
      infiniteQuery.refetch();
    } else {
      paginatedQuery.refetch();
    }
  }, [enableInfiniteScroll, infiniteQuery, paginatedQuery]);

  const reset = useCallback(() => {
    setCurrentPage(initialPage);
    setPageSizeState(initialPageSize);
    refresh();
  }, [initialPage, initialPageSize, refresh]);

  // Prefetch next page for regular pagination
  useEffect(() => {
    if (
      !enableInfiniteScroll && 
      prefetchNextPage && 
      paginationMeta?.hasNextPage
    ) {
      // Note: This would require access to queryClient for prefetching
      // Implementation depends on your React Query setup
    }
  }, [enableInfiniteScroll, prefetchNextPage, paginationMeta?.hasNextPage, currentPage]);

  return {
    // Data
    data,
    allData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isLoadingMore: enableInfiniteScroll ? infiniteQuery.isFetchingNextPage : false,
    error: query.error as Error | null,
    isEmpty: allData.length === 0 && !query.isLoading,

    // Pagination state
    currentPage: paginationMeta?.page || currentPage,
    pageSize,
    totalItems: paginationMeta?.total || 0,
    totalPages: paginationMeta?.totalPages || 0,
    hasNextPage: paginationMeta?.hasNextPage || false,
    hasPreviousPage: paginationMeta?.hasPreviousPage || false,

    // Actions
    setPage,
    setPageSize,
    nextPage,
    previousPage,
    loadMore,
    refresh,
    reset,

    // For infinite scroll
    fetchNextPage: infiniteQuery.fetchNextPage || (() => {}),
    hasNext: enableInfiniteScroll ? infiniteQuery.hasNextPage || false : false,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage || false,
  };
}

// Specialized hooks for common use cases
export function useInfinitePagination<T = any>(
  queryKey: string | readonly unknown[],
  queryFn: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  pageSize: number = 50
): PaginationResult<T> {
  return usePagination(queryKey, queryFn, {
    enableInfiniteScroll: true,
    initialPageSize: pageSize,
    prefetchNextPage: false,
  });
}

export function useTablePagination<T = any>(
  queryKey: string | readonly unknown[],
  queryFn: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  initialPageSize: number = 25
): PaginationResult<T> {
  return usePagination(queryKey, queryFn, {
    enableInfiniteScroll: false,
    initialPageSize,
    prefetchNextPage: true,
  });
}

// Helper function to create paginated query functions
export function createPaginatedQuery<T>(
  baseUrl: string,
  transform?: (data: any) => T[]
) {
  return async (page: number, pageSize: number): Promise<PaginatedResponse<T>> => {
    const response = await fetch(
      `${baseUrl}?page=${page}&pageSize=${pageSize}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    return {
      data: transform ? transform(result.data) : result.data,
      pagination: result.pagination,
    };
  };
}

export default usePagination;