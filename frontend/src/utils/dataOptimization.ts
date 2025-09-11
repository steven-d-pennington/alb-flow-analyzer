// Data optimization utilities for handling large datasets

/**
 * Batches data processing to avoid blocking the UI thread
 */
export function processBatches<T, R>(
  data: T[],
  processor: (batch: T[]) => R[],
  batchSize: number = 1000,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  return new Promise((resolve) => {
    const result: R[] = [];
    let currentIndex = 0;

    const processNextBatch = () => {
      const batch = data.slice(currentIndex, currentIndex + batchSize);
      if (batch.length === 0) {
        resolve(result);
        return;
      }

      const batchResult = processor(batch);
      result.push(...batchResult);
      currentIndex += batchSize;

      if (onProgress) {
        onProgress(Math.min(currentIndex, data.length), data.length);
      }

      // Use requestIdleCallback if available, otherwise setTimeout
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(processNextBatch);
      } else {
        setTimeout(processNextBatch, 0);
      }
    };

    processNextBatch();
  });
}

/**
 * Creates a memoized data transformer with cache size limit
 */
export function createMemoizedTransformer<T, R>(
  transformer: (data: T[]) => R,
  cacheSize: number = 10
): (data: T[]) => R {
  const cache = new Map<string, { result: R; timestamp: number }>();

  return (data: T[]): R => {
    const key = JSON.stringify(data).substring(0, 100); // Hash subset for performance
    const cached = cache.get(key);

    // Return cached result if it exists and is recent (within 5 minutes)
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.result;
    }

    const result = transformer(data);

    // Maintain cache size limit
    if (cache.size >= cacheSize) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    cache.set(key, { result, timestamp: Date.now() });
    return result;
  };
}

/**
 * Debounces data processing to avoid excessive updates
 */
export function debounceDataProcessing<T extends any[]>(
  fn: (...args: T) => void,
  delay: number = 300
): (...args: T) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: T) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Creates chunks of data for progressive loading
 */
export function createDataChunks<T>(data: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Optimizes data structure for virtualization
 */
export interface VirtualizationData<T> {
  items: T[];
  totalCount: number;
  startIndex: number;
  endIndex: number;
}

export function optimizeForVirtualization<T>(
  data: T[],
  startIndex: number,
  endIndex: number,
  overscan: number = 5
): VirtualizationData<T> {
  const actualStart = Math.max(0, startIndex - overscan);
  const actualEnd = Math.min(data.length, endIndex + overscan);
  
  return {
    items: data.slice(actualStart, actualEnd),
    totalCount: data.length,
    startIndex: actualStart,
    endIndex: actualEnd,
  };
}

/**
 * Filters data efficiently for large datasets
 */
export function efficientFilter<T>(
  data: T[],
  predicate: (item: T, index: number) => boolean,
  maxResults?: number
): T[] {
  const result: T[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (predicate(data[i], i)) {
      result.push(data[i]);
      
      if (maxResults && result.length >= maxResults) {
        break;
      }
    }
  }
  
  return result;
}

/**
 * Sorts data efficiently using optimized algorithms
 */
export function efficientSort<T>(
  data: T[],
  compareFn: (a: T, b: T) => number,
  algorithm: 'quicksort' | 'mergesort' | 'native' = 'native'
): T[] {
  switch (algorithm) {
    case 'native':
      return [...data].sort(compareFn);
    
    case 'quicksort':
      return quickSort([...data], compareFn);
    
    case 'mergesort':
      return mergeSort([...data], compareFn);
    
    default:
      return [...data].sort(compareFn);
  }
}

function quickSort<T>(arr: T[], compare: (a: T, b: T) => number): T[] {
  if (arr.length <= 1) return arr;
  
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter(x => compare(x, pivot) < 0);
  const middle = arr.filter(x => compare(x, pivot) === 0);
  const right = arr.filter(x => compare(x, pivot) > 0);
  
  return [...quickSort(left, compare), ...middle, ...quickSort(right, compare)];
}

function mergeSort<T>(arr: T[], compare: (a: T, b: T) => number): T[] {
  if (arr.length <= 1) return arr;
  
  const middle = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, middle), compare);
  const right = mergeSort(arr.slice(middle), compare);
  
  return merge(left, right, compare);
}

function merge<T>(left: T[], right: T[], compare: (a: T, b: T) => number): T[] {
  const result: T[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  
  while (leftIndex < left.length && rightIndex < right.length) {
    if (compare(left[leftIndex], right[rightIndex]) <= 0) {
      result.push(left[leftIndex]);
      leftIndex++;
    } else {
      result.push(right[rightIndex]);
      rightIndex++;
    }
  }
  
  return result.concat(left.slice(leftIndex)).concat(right.slice(rightIndex));
}

/**
 * Creates a data aggregator for summary statistics
 */
export class DataAggregator<T> {
  private data: T[] = [];
  private cached = new Map<string, any>();

  constructor(initialData: T[] = []) {
    this.data = initialData;
  }

  add(items: T[]): void {
    this.data.push(...items);
    this.cached.clear(); // Clear cache when data changes
  }

  count(): number {
    return this.data.length;
  }

  sum(selector: (item: T) => number): number {
    const key = `sum_${selector.toString()}`;
    if (this.cached.has(key)) {
      return this.cached.get(key);
    }

    const result = this.data.reduce((sum, item) => sum + selector(item), 0);
    this.cached.set(key, result);
    return result;
  }

  average(selector: (item: T) => number): number {
    const sum = this.sum(selector);
    return this.data.length > 0 ? sum / this.data.length : 0;
  }

  max(selector: (item: T) => number): number {
    const key = `max_${selector.toString()}`;
    if (this.cached.has(key)) {
      return this.cached.get(key);
    }

    const result = Math.max(...this.data.map(selector));
    this.cached.set(key, result);
    return result;
  }

  min(selector: (item: T) => number): number {
    const key = `min_${selector.toString()}`;
    if (this.cached.has(key)) {
      return this.cached.get(key);
    }

    const result = Math.min(...this.data.map(selector));
    this.cached.set(key, result);
    return result;
  }

  groupBy<K extends string | number>(
    keySelector: (item: T) => K
  ): Map<K, T[]> {
    const key = `groupBy_${keySelector.toString()}`;
    if (this.cached.has(key)) {
      return this.cached.get(key);
    }

    const result = new Map<K, T[]>();
    for (const item of this.data) {
      const itemKey = keySelector(item);
      if (!result.has(itemKey)) {
        result.set(itemKey, []);
      }
      result.get(itemKey)!.push(item);
    }

    this.cached.set(key, result);
    return result;
  }

  percentile(selector: (item: T) => number, p: number): number {
    const values = this.data.map(selector).sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }

  clear(): void {
    this.data = [];
    this.cached.clear();
  }
}

/**
 * Memory-efficient data structure for large datasets
 */
export class VirtualDataStore<T> {
  private chunks = new Map<number, T[]>();
  private chunkSize: number;
  private totalSize: number;
  private maxCachedChunks: number;

  constructor(chunkSize: number = 1000, maxCachedChunks: number = 10) {
    this.chunkSize = chunkSize;
    this.maxCachedChunks = maxCachedChunks;
    this.totalSize = 0;
  }

  setData(data: T[]): void {
    this.totalSize = data.length;
    this.chunks.clear();

    // Pre-load first chunk
    if (data.length > 0) {
      this.chunks.set(0, data.slice(0, this.chunkSize));
    }
  }

  async getRange(startIndex: number, endIndex: number): Promise<T[]> {
    const result: T[] = [];
    const startChunk = Math.floor(startIndex / this.chunkSize);
    const endChunk = Math.floor(endIndex / this.chunkSize);

    for (let chunkIndex = startChunk; chunkIndex <= endChunk; chunkIndex++) {
      const chunk = await this.getChunk(chunkIndex);
      if (chunk) {
        const chunkStart = Math.max(0, startIndex - chunkIndex * this.chunkSize);
        const chunkEnd = Math.min(chunk.length, endIndex - chunkIndex * this.chunkSize + 1);
        result.push(...chunk.slice(chunkStart, chunkEnd));
      }
    }

    return result;
  }

  private async getChunk(chunkIndex: number): Promise<T[] | null> {
    if (this.chunks.has(chunkIndex)) {
      return this.chunks.get(chunkIndex)!;
    }

    // Simulate async chunk loading (in real app, this would fetch from API)
    return new Promise((resolve) => {
      setTimeout(() => {
        // Clean up old chunks if we exceed the cache limit
        if (this.chunks.size >= this.maxCachedChunks) {
          const oldestChunk = this.chunks.keys().next().value;
          this.chunks.delete(oldestChunk);
        }

        // In a real implementation, you would load the chunk from your data source
        const chunk: T[] = []; // This would be loaded from API/database
        this.chunks.set(chunkIndex, chunk);
        resolve(chunk);
      }, 10); // Simulate network delay
    });
  }

  getTotalSize(): number {
    return this.totalSize;
  }
}