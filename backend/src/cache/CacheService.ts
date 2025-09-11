/**
 * Core cache service with support for in-memory and Redis caching
 */

import NodeCache from 'node-cache';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import zlib from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';
import {
  CacheConfig,
  CacheKey,
  CacheEntry,
  CacheMetadata,
  CacheStats,
  CacheNamespace,
  CacheStrategy,
  InvalidationRule,
  CacheMetrics,
  OperationMetric
} from './types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CacheService {
  private config: CacheConfig;
  private memoryCache: NodeCache | null = null;
  private lruCache: LRUCache<string, CacheEntry> | null = null;
  private redisClient: Redis | null = null;
  private stats: CacheStats;
  private metrics: CacheMetrics;
  private strategies: Map<CacheNamespace, CacheStrategy>;
  private performanceTracking: Map<string, number>;

  constructor(config: CacheConfig) {
    this.config = {
      defaultTTL: 300, // 5 minutes default
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      enableMetrics: true,
      ...config
    };

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      keyCount: 0,
      avgResponseTime: 0,
      evictions: 0
    };

    this.metrics = this.initializeMetrics();
    this.strategies = new Map();
    this.performanceTracking = new Map();

    this.initializeCacheBackends();
    this.setupDefaultStrategies();
  }

  private initializeMetrics(): CacheMetrics {
    return {
      operations: {
        get: { count: 0, successCount: 0, errorCount: 0, avgDuration: 0 },
        set: { count: 0, successCount: 0, errorCount: 0, avgDuration: 0 },
        delete: { count: 0, successCount: 0, errorCount: 0, avgDuration: 0 },
        invalidate: { count: 0, successCount: 0, errorCount: 0, avgDuration: 0 }
      },
      memory: {
        used: 0,
        available: 0,
        percentage: 0
      },
      performance: {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0
      }
    };
  }

  private initializeCacheBackends(): void {
    // Initialize in-memory cache
    if (this.config.type === 'memory' || this.config.type === 'hybrid') {
      const memConfig = this.config.memory || {};
      
      // Use LRU cache for better memory management with large datasets
      this.lruCache = new LRUCache<string, CacheEntry>({
        max: memConfig.maxSize || 10000, // Limit to 10k items for 2M+ records
        ttl: (memConfig.maxAge || this.config.defaultTTL || 300) * 1000, // Convert to ms
        updateAgeOnGet: memConfig.updateAgeOnGet !== false,
        allowStale: false,
        dispose: (value: CacheEntry, key: string) => {
          this.stats.evictions++;
          console.log(`Cache eviction: ${key}`);
        }
      });

      // Also keep NodeCache for simpler operations
      this.memoryCache = new NodeCache({
        stdTTL: memConfig.maxAge || this.config.defaultTTL || 300,
        checkperiod: memConfig.checkPeriod || 60,
        useClones: false, // Don't clone for performance
        deleteOnExpire: true
      });

      this.memoryCache.on('expired', (key: string) => {
        this.stats.evictions++;
      });
    }

    // Initialize Redis client
    if (this.config.type === 'redis' || this.config.type === 'hybrid') {
      const redisConfig = this.config.redis || {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'alb:',
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true
      };
      this.redisClient = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db || 0,
        keyPrefix: redisConfig.keyPrefix,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest || 3,
        enableOfflineQueue: redisConfig.enableOfflineQueue !== false,
        lazyConnect: true
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis cache error:', err);
        // Fallback to memory cache if Redis fails
        if (this.config.type === 'hybrid' && !this.memoryCache) {
          this.initializeMemoryFallback();
        }
      });

      this.redisClient.on('connect', () => {
        console.log('Redis cache connected');
      });
    }
  }

  private initializeMemoryFallback(): void {
    this.memoryCache = new NodeCache({
      stdTTL: this.config.defaultTTL || 300,
      checkperiod: 60,
      useClones: false
    });
  }

  private setupDefaultStrategies(): void {
    // Analysis results - cache for 5 minutes
    this.strategies.set(CacheNamespace.ANALYSIS, {
      namespace: CacheNamespace.ANALYSIS,
      ttl: 300, // 5 minutes
      maxSize: 100,
      compressionEnabled: true,
      warmupEnabled: true
    });

    // Workflow analysis - cache for 10 minutes
    this.strategies.set(CacheNamespace.WORKFLOW, {
      namespace: CacheNamespace.WORKFLOW,
      ttl: 600, // 10 minutes
      maxSize: 200,
      compressionEnabled: true,
      warmupEnabled: true
    });

    // Session reconstruction - cache for 15 minutes
    this.strategies.set(CacheNamespace.SESSION, {
      namespace: CacheNamespace.SESSION,
      ttl: 900, // 15 minutes
      maxSize: 500,
      compressionEnabled: true,
      warmupEnabled: false
    });

    // Aggregations - cache for 30 minutes
    this.strategies.set(CacheNamespace.AGGREGATION, {
      namespace: CacheNamespace.AGGREGATION,
      ttl: 1800, // 30 minutes
      maxSize: 50,
      compressionEnabled: true,
      warmupEnabled: true
    });

    // Query results - cache for 2 minutes
    this.strategies.set(CacheNamespace.QUERY, {
      namespace: CacheNamespace.QUERY,
      ttl: 120, // 2 minutes
      maxSize: 1000,
      compressionEnabled: true,
      warmupEnabled: false
    });

    // Pattern discovery - cache for 20 minutes
    this.strategies.set(CacheNamespace.PATTERN, {
      namespace: CacheNamespace.PATTERN,
      ttl: 1200, // 20 minutes
      maxSize: 100,
      compressionEnabled: true,
      warmupEnabled: true
    });

    // S3 listings - cache for 1 minute
    this.strategies.set(CacheNamespace.S3, {
      namespace: CacheNamespace.S3,
      ttl: 60, // 1 minute
      maxSize: 100,
      compressionEnabled: false,
      warmupEnabled: false
    });

    // Auth validation - cache for 5 minutes
    this.strategies.set(CacheNamespace.AUTH, {
      namespace: CacheNamespace.AUTH,
      ttl: 300, // 5 minutes
      maxSize: 50,
      compressionEnabled: false,
      warmupEnabled: false
    });

    // Export results - cache for 10 minutes
    this.strategies.set(CacheNamespace.EXPORT, {
      namespace: CacheNamespace.EXPORT,
      ttl: 600, // 10 minutes
      maxSize: 50,
      compressionEnabled: true,
      warmupEnabled: false
    });
  }

  /**
   * Generate a cache key
   */
  public generateKey(namespace: CacheNamespace, key: string, version?: number): string {
    const versionStr = version ? `:v${version}` : '';
    return `${namespace}:${key}${versionStr}`;
  }

  /**
   * Hash a complex object to create a stable key
   */
  public hashKey(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  /**
   * Get a value from cache
   */
  public async get<T>(
    namespace: CacheNamespace,
    key: string,
    options?: { version?: number; decompress?: boolean }
  ): Promise<T | null> {
    const startTime = Date.now();
    const fullKey = this.generateKey(namespace, key, options?.version);

    try {
      let entry: CacheEntry<T> | null = null;

      // Try memory cache first
      if (this.lruCache) {
        entry = this.lruCache.get(fullKey) || null;
      }

      // Fallback to Redis if not in memory
      if (!entry && this.redisClient) {
        const data = await this.redisClient.get(fullKey);
        if (data) {
          entry = JSON.parse(data);
        }
      }

      if (!entry) {
        this.stats.misses++;
        this.recordMetric('get', false, Date.now() - startTime);
        return null;
      }

      // Decompress if needed
      let result = entry.data;
      if (entry.metadata.compressed && options?.decompress !== false) {
        const buffer = Buffer.from(result as any, 'base64');
        const decompressed = await gunzip(buffer);
        result = JSON.parse(decompressed.toString());
      }

      // Update access metadata
      entry.metadata.accessCount++;
      entry.metadata.lastAccessedAt = Date.now();

      this.stats.hits++;
      this.updateHitRate();
      this.recordMetric('get', true, Date.now() - startTime);

      return result;
    } catch (error) {
      console.error(`Cache get error for ${fullKey}:`, error);
      this.recordMetric('get', false, Date.now() - startTime, error as Error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  public async set<T>(
    namespace: CacheNamespace,
    key: string,
    value: T,
    options?: {
      ttl?: number;
      version?: number;
      tags?: string[];
      compress?: boolean;
    }
  ): Promise<boolean> {
    const startTime = Date.now();
    const fullKey = this.generateKey(namespace, key, options?.version);
    const strategy = this.strategies.get(namespace);

    try {
      // Determine TTL
      const ttl = options?.ttl || strategy?.ttl || this.config.defaultTTL || 300;

      // Compress if needed
      let dataToStore: any = value;
      let compressed = false;

      if (
        (options?.compress !== false) &&
        (strategy?.compressionEnabled || this.config.enableCompression) &&
        this.shouldCompress(value)
      ) {
        const jsonStr = JSON.stringify(value);
        if (jsonStr.length > (this.config.compressionThreshold || 1024)) {
          const compressedBuffer = await gzip(jsonStr);
          dataToStore = compressedBuffer.toString('base64');
          compressed = true;
        }
      }

      // Create cache entry
      const entry: CacheEntry<T> = {
        data: dataToStore,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          lastAccessedAt: Date.now(),
          ttl,
          size: JSON.stringify(dataToStore).length,
          compressed,
          tags: options?.tags
        }
      };

      // Store in memory cache
      if (this.lruCache) {
        this.lruCache.set(fullKey, entry, { ttl: ttl * 1000 });
      }

      // Store in Redis
      if (this.redisClient) {
        await this.redisClient.setex(fullKey, ttl, JSON.stringify(entry));
        
        // Add to tags index if tags provided
        if (options?.tags && options.tags.length > 0) {
          for (const tag of options.tags) {
            await this.redisClient.sadd(`tag:${tag}`, fullKey);
          }
        }
      }

      this.stats.sets++;
      this.stats.keyCount++;
      this.recordMetric('set', true, Date.now() - startTime);

      return true;
    } catch (error) {
      console.error(`Cache set error for ${fullKey}:`, error);
      this.recordMetric('set', false, Date.now() - startTime, error as Error);
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  public async delete(
    namespace: CacheNamespace,
    key: string,
    options?: { version?: number }
  ): Promise<boolean> {
    const startTime = Date.now();
    const fullKey = this.generateKey(namespace, key, options?.version);

    try {
      // Delete from memory cache
      if (this.lruCache) {
        this.lruCache.delete(fullKey);
      }

      // Delete from Redis
      if (this.redisClient) {
        await this.redisClient.del(fullKey);
      }

      this.stats.deletes++;
      this.stats.keyCount = Math.max(0, this.stats.keyCount - 1);
      this.recordMetric('delete', true, Date.now() - startTime);

      return true;
    } catch (error) {
      console.error(`Cache delete error for ${fullKey}:`, error);
      this.recordMetric('delete', false, Date.now() - startTime, error as Error);
      return false;
    }
  }

  /**
   * Invalidate cache by pattern, tags, or namespace
   */
  public async invalidate(options: {
    namespace?: CacheNamespace;
    pattern?: string;
    tags?: string[];
  }): Promise<number> {
    const startTime = Date.now();
    let invalidatedCount = 0;

    try {
      if (options.namespace) {
        // Invalidate entire namespace
        const pattern = `${options.namespace}:*`;
        invalidatedCount = await this.invalidateByPattern(pattern);
      } else if (options.pattern) {
        // Invalidate by pattern
        invalidatedCount = await this.invalidateByPattern(options.pattern);
      } else if (options.tags && options.tags.length > 0) {
        // Invalidate by tags
        invalidatedCount = await this.invalidateByTags(options.tags);
      }

      this.recordMetric('invalidate', true, Date.now() - startTime);
      return invalidatedCount;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      this.recordMetric('invalidate', false, Date.now() - startTime, error as Error);
      return 0;
    }
  }

  private async invalidateByPattern(pattern: string): Promise<number> {
    let count = 0;

    // Clear from memory cache
    if (this.lruCache) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      for (const key of this.lruCache.keys()) {
        if (regex.test(key)) {
          this.lruCache.delete(key);
          count++;
        }
      }
    }

    // Clear from Redis
    if (this.redisClient) {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient!.del(...keys);
        count += keys.length;
      }
    }

    return count;
  }

  private async invalidateByTags(tags: string[]): Promise<number> {
    let count = 0;

    if (this.redisClient) {
      for (const tag of tags) {
        const keys = await this.redisClient.smembers(`tag:${tag}`);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
          await this.redisClient.del(`tag:${tag}`);
          count += keys.length;
        }
      }
    }

    return count;
  }

  /**
   * Clear all cache
   */
  public async clear(): Promise<void> {
    if (this.lruCache) {
      this.lruCache.clear();
    }

    if (this.memoryCache) {
      this.memoryCache.flushAll();
    }

    if (this.redisClient) {
      await this.redisClient.flushdb();
    }

    this.stats.keyCount = 0;
    console.log('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache metrics
   */
  public getMetrics(): CacheMetrics {
    // Update memory usage
    if (this.lruCache) {
      this.metrics.memory.used = this.lruCache.size;
      this.metrics.memory.available = this.lruCache.max;
      this.metrics.memory.percentage = (this.lruCache.size / this.lruCache.max) * 100;
    }

    return { ...this.metrics };
  }

  /**
   * Check cache health
   */
  public async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    const checks = {
      memory: false,
      redis: false,
      hitRate: this.stats.hitRate > 0.5 // Healthy if hit rate > 50%
    };

    if (this.lruCache) {
      checks.memory = true;
    }

    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        checks.redis = true;
      } catch (error) {
        checks.redis = false;
      }
    }

    const healthy = Object.values(checks).some(v => v);

    return {
      healthy,
      details: {
        ...checks,
        stats: this.getStats(),
        metrics: this.getMetrics()
      }
    };
  }

  /**
   * Close cache connections
   */
  public async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    if (this.memoryCache) {
      this.memoryCache.close();
    }

    console.log('Cache connections closed');
  }

  // Helper methods
  private shouldCompress(value: any): boolean {
    const size = JSON.stringify(value).length;
    return size > (this.config.compressionThreshold || 1024);
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private recordMetric(
    operation: 'get' | 'set' | 'delete' | 'invalidate',
    success: boolean,
    duration: number,
    error?: Error
  ): void {
    const metric = this.metrics.operations[operation];
    metric.count++;
    
    if (success) {
      metric.successCount++;
    } else {
      metric.errorCount++;
      if (error) {
        metric.lastError = error.message;
      }
    }

    // Update average duration
    metric.avgDuration = (metric.avgDuration * (metric.count - 1) + duration) / metric.count;

    // Track performance for latency percentiles
    const perfKey = `${operation}:${Date.now()}`;
    this.performanceTracking.set(perfKey, duration);

    // Clean old performance entries (keep last 1000)
    if (this.performanceTracking.size > 1000) {
      const oldestKey = this.performanceTracking.keys().next().value;
      if (oldestKey) {
        this.performanceTracking.delete(oldestKey);
      }
    }
  }
}