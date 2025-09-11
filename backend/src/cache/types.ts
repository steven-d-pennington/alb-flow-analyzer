/**
 * Cache service type definitions
 */

export interface CacheConfig {
  type: 'memory' | 'redis' | 'hybrid';
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    enableOfflineQueue?: boolean;
  };
  memory?: {
    maxSize?: number; // Max number of items
    maxAge?: number; // Default TTL in seconds
    updateAgeOnGet?: boolean; // Refresh TTL on access
    checkPeriod?: number; // Cleanup interval in seconds
  };
  defaultTTL?: number; // Default TTL in seconds
  enableCompression?: boolean;
  compressionThreshold?: number; // Bytes
  enableMetrics?: boolean;
}

export interface CacheKey {
  namespace: string;
  key: string;
  version?: number;
}

export interface CacheEntry<T = any> {
  data: T;
  metadata: CacheMetadata;
}

export interface CacheMetadata {
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  ttl?: number;
  size?: number; // Size in bytes
  compressed?: boolean;
  tags?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  memoryUsage?: number;
  keyCount: number;
  avgResponseTime: number;
  evictions: number;
}

export interface CacheMetrics {
  operations: {
    get: OperationMetric;
    set: OperationMetric;
    delete: OperationMetric;
    invalidate: OperationMetric;
  };
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
  performance: {
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
}

export interface OperationMetric {
  count: number;
  successCount: number;
  errorCount: number;
  avgDuration: number;
  lastError?: string;
}

export enum CacheNamespace {
  ANALYSIS = 'analysis',
  WORKFLOW = 'workflow',
  SESSION = 'session',
  AGGREGATION = 'aggregation',
  QUERY = 'query',
  S3 = 's3',
  AUTH = 'auth',
  EXPORT = 'export',
  PATTERN = 'pattern'
}

export interface CacheStrategy {
  namespace: CacheNamespace;
  ttl: number; // TTL in seconds
  maxSize?: number; // Max items per namespace
  compressionEnabled?: boolean;
  warmupEnabled?: boolean;
  invalidationRules?: InvalidationRule[];
}

export interface InvalidationRule {
  type: 'tag' | 'pattern' | 'time' | 'dependency';
  pattern?: string;
  tags?: string[];
  maxAge?: number;
  dependencies?: string[];
}

export interface WarmupConfig {
  enabled: boolean;
  schedule?: string; // Cron expression
  queries: WarmupQuery[];
  maxConcurrency?: number;
}

export interface WarmupQuery {
  namespace: CacheNamespace;
  key: string;
  generator: () => Promise<any>;
  priority?: number;
}

// Cache layer types for different data types
export interface CacheableData {
  isCacheable(): boolean;
  getCacheKey(): string;
  getCacheTTL(): number;
  getCacheTags(): string[];
}

export interface CacheInvalidationEvent {
  type: 'insert' | 'update' | 'delete' | 'bulk';
  namespace: CacheNamespace;
  keys?: string[];
  tags?: string[];
  pattern?: string;
  timestamp: number;
}

// Performance monitoring
export interface CachePerformance {
  operationId: string;
  operation: 'get' | 'set' | 'delete' | 'invalidate';
  namespace: string;
  key: string;
  duration: number;
  success: boolean;
  error?: string;
  size?: number;
  compressed?: boolean;
}