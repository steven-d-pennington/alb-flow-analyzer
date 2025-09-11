import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  componentMountTime: number;
  memoryUsage?: number;
}

interface UsePerformanceOptions {
  trackMemory?: boolean;
  logMetrics?: boolean;
  componentName?: string;
}

export function usePerformance(options: UsePerformanceOptions = {}) {
  const {
    trackMemory = false,
    logMetrics = process.env.NODE_ENV === 'development',
    componentName = 'Component'
  } = options;

  const mountTimeRef = useRef<number>(Date.now());
  const renderCountRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(Date.now());

  // Track component mount time
  useEffect(() => {
    const mountTime = Date.now() - mountTimeRef.current;
    
    if (logMetrics) {
      console.log(`[Performance] ${componentName} mounted in ${mountTime}ms`);
    }

    return () => {
      if (logMetrics) {
        console.log(`[Performance] ${componentName} unmounted after ${renderCountRef.current} renders`);
      }
    };
  }, [componentName, logMetrics]);

  // Track render performance
  useEffect(() => {
    const renderTime = Date.now() - lastRenderTimeRef.current;
    renderCountRef.current += 1;

    if (logMetrics && renderCountRef.current > 1) {
      console.log(`[Performance] ${componentName} render #${renderCountRef.current} took ${renderTime}ms`);
    }

    lastRenderTimeRef.current = Date.now();
  });

  // Measure memory usage (if supported)
  const measureMemory = useCallback(async () => {
    if (!trackMemory || !('memory' in performance)) {
      return undefined;
    }

    try {
      // @ts-ignore - performance.memory is not in standard types
      const memInfo = performance.memory;
      return {
        usedJSHeapSize: memInfo.usedJSHeapSize,
        totalJSHeapSize: memInfo.totalJSHeapSize,
        jsHeapSizeLimit: memInfo.jsHeapSizeLimit,
      };
    } catch (error) {
      console.warn('Memory measurement not supported:', error);
      return undefined;
    }
  }, [trackMemory]);

  // Performance measurement utilities
  const startMeasurement = useCallback((label: string) => {
    const startTime = performance.now();
    
    return {
      end: () => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        if (logMetrics) {
          console.log(`[Performance] ${componentName} - ${label}: ${duration.toFixed(2)}ms`);
        }
        
        return duration;
      }
    };
  }, [componentName, logMetrics]);

  // Measure async operations
  const measureAsync = useCallback(async <T>(
    operation: () => Promise<T>,
    label: string
  ): Promise<{ result: T; duration: number }> => {
    const measurement = startMeasurement(label);
    const result = await operation();
    const duration = measurement.end();
    
    return { result, duration };
  }, [startMeasurement]);

  // Get current performance metrics
  const getMetrics = useCallback(async (): Promise<PerformanceMetrics> => {
    const memory = await measureMemory();
    
    return {
      renderTime: Date.now() - lastRenderTimeRef.current,
      componentMountTime: Date.now() - mountTimeRef.current,
      memoryUsage: memory?.usedJSHeapSize,
    };
  }, [measureMemory]);

  return {
    startMeasurement,
    measureAsync,
    getMetrics,
    renderCount: renderCountRef.current,
  };
}

// Hook for measuring data processing performance
export function useDataProcessingPerformance() {
  const { startMeasurement } = usePerformance({
    componentName: 'DataProcessor',
    trackMemory: true,
    logMetrics: true,
  });

  const measureDataTransformation = useCallback(<T, R>(
    data: T[],
    transformer: (data: T[]) => R,
    label: string = 'Data transformation'
  ): R => {
    const measurement = startMeasurement(`${label} (${data.length} items)`);
    const result = transformer(data);
    measurement.end();
    return result;
  }, [startMeasurement]);

  const measureVirtualization = useCallback((
    totalItems: number,
    visibleItems: number,
    operation: () => void,
    label: string = 'Virtualization render'
  ) => {
    const measurement = startMeasurement(
      `${label} (${visibleItems}/${totalItems} items)`
    );
    operation();
    measurement.end();
  }, [startMeasurement]);

  return {
    measureDataTransformation,
    measureVirtualization,
  };
}

// Performance monitoring for large datasets
export function useLargeDatasetPerformance(dataSize: number) {
  const thresholds = {
    small: 1000,
    medium: 10000,
    large: 100000,
    huge: 1000000,
  };

  const getDatasetSize = () => {
    if (dataSize < thresholds.small) return 'small';
    if (dataSize < thresholds.medium) return 'medium';
    if (dataSize < thresholds.large) return 'large';
    if (dataSize < thresholds.huge) return 'huge';
    return 'massive';
  };

  const shouldUseVirtualization = dataSize > thresholds.small;
  const shouldUsePagination = dataSize > thresholds.medium;
  const shouldUseWebWorker = dataSize > thresholds.large;
  const shouldUseStreamProcessing = dataSize > thresholds.huge;

  const { measureAsync } = usePerformance({
    componentName: `LargeDataset-${getDatasetSize()}`,
    trackMemory: true,
    logMetrics: true,
  });

  return {
    datasetSize: getDatasetSize(),
    shouldUseVirtualization,
    shouldUsePagination,
    shouldUseWebWorker,
    shouldUseStreamProcessing,
    measureAsync,
    thresholds,
  };
}

export default usePerformance;