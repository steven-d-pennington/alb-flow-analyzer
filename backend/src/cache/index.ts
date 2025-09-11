/**
 * Cache module exports
 */

// Core services
export { CacheService } from './CacheService';
export { CacheInvalidation } from './CacheInvalidation';
export { CacheWarming } from './CacheWarming';
export { CacheMonitoring } from './CacheMonitoring';
export { CacheManager } from './CacheManager';

// Middleware
export {
  cacheMiddleware,
  conditionalCache,
  cacheInvalidationMiddleware,
  smartCacheMiddleware
} from './CacheMiddleware';

// Types
export * from './types';

// Factory function for easy setup
export function createCacheManager(config: any) {
  const { CacheManager: CM } = require('./CacheManager');
  return new CM(config);
}

// Default configurations
export const DEFAULT_CACHE_CONFIG = {
  type: 'hybrid' as const,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'alb:',
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true
  },
  memory: {
    maxSize: 10000,
    maxAge: 300, // 5 minutes
    updateAgeOnGet: true,
    checkPeriod: 60
  },
  defaultTTL: 300, // 5 minutes
  enableCompression: true,
  compressionThreshold: 1024, // 1KB
  enableMetrics: true
};

export const PRODUCTION_CACHE_CONFIG = {
  ...DEFAULT_CACHE_CONFIG,
  type: 'redis' as const,
  redis: {
    ...DEFAULT_CACHE_CONFIG.redis,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  },
  memory: {
    maxSize: 50000, // Larger for production
    maxAge: 600, // 10 minutes
    updateAgeOnGet: true,
    checkPeriod: 120
  },
  defaultTTL: 600, // 10 minutes for production
  compressionThreshold: 512 // More aggressive compression
};

export const DEVELOPMENT_CACHE_CONFIG = {
  ...DEFAULT_CACHE_CONFIG,
  type: 'memory' as const,
  memory: {
    maxSize: 5000,
    maxAge: 120, // 2 minutes for dev
    updateAgeOnGet: true,
    checkPeriod: 30
  },
  defaultTTL: 120, // 2 minutes for dev
  enableCompression: false // Disable compression in dev
};

// Cache strategy presets for different data types
export const CACHE_STRATEGIES = {
  // Fast-changing data (2 minutes)
  REALTIME: {
    ttl: 120,
    compressionEnabled: false,
    warmupEnabled: false
  },

  // Moderate data (5 minutes) - Default for most queries
  STANDARD: {
    ttl: 300,
    compressionEnabled: true,
    warmupEnabled: false
  },

  // Analysis results (10 minutes)
  ANALYSIS: {
    ttl: 600,
    compressionEnabled: true,
    warmupEnabled: true
  },

  // Aggregated data (30 minutes)
  AGGREGATED: {
    ttl: 1800,
    compressionEnabled: true,
    warmupEnabled: true
  },

  // Reference data (1 hour)
  REFERENCE: {
    ttl: 3600,
    compressionEnabled: true,
    warmupEnabled: false
  },

  // Static data (24 hours)
  STATIC: {
    ttl: 86400,
    compressionEnabled: true,
    warmupEnabled: false
  }
};

// Utility functions
export function getCacheKey(namespace: string, ...parts: (string | number | object)[]): string {
  const keyParts = parts.map(part => {
    if (typeof part === 'object') {
      return JSON.stringify(part, Object.keys(part).sort());
    }
    return String(part);
  });

  return `${namespace}:${keyParts.join(':')}`;
}

export function createCacheKeyFromRequest(req: any): string {
  return getCacheKey(
    'request',
    req.method,
    req.path,
    req.query,
    req.user?.id || 'anonymous'
  );
}

export function shouldCacheResponse(statusCode: number, headers: any): boolean {
  // Don't cache error responses
  if (statusCode >= 400) {
    return false;
  }

  // Don't cache if explicitly told not to
  if (headers['cache-control']?.includes('no-cache') || headers['x-cache-skip']) {
    return false;
  }

  // Don't cache responses with sensitive data
  if (headers['x-sensitive-data']) {
    return false;
  }

  return true;
}

// Health check utility
export async function checkCacheHealth(cacheManager: any): Promise<{
  healthy: boolean;
  details: any;
}> {
  if (!cacheManager.isInitialized()) {
    return {
      healthy: false,
      details: { error: 'Cache manager not initialized' }
    };
  }

  try {
    const status = await cacheManager.getStatus();
    return {
      healthy: status.health.overall === 'healthy',
      details: status
    };
  } catch (error) {
    return {
      healthy: false,
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}