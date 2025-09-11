/**
 * Express middleware for caching API responses
 */

import { Request, Response, NextFunction } from 'express';
import { CacheService } from './CacheService';
import { CacheNamespace } from './types';

export interface CacheOptions {
  namespace: CacheNamespace;
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  skipCache?: (req: Request) => boolean;
  tags?: string[] | ((req: Request) => string[]);
  compress?: boolean;
  vary?: string[];
  staleWhileRevalidate?: boolean;
  maxStaleAge?: number;
}

export interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  cachedAt: number;
  etag?: string;
}

/**
 * Create cache middleware
 */
export function cacheMiddleware(cacheService: CacheService, options: CacheOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip cache if condition not met
    if (options.skipCache?.(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = options.keyGenerator
      ? options.keyGenerator(req)
      : generateDefaultKey(req);

    // Add cache headers
    res.set('X-Cache-Namespace', options.namespace);
    res.set('X-Cache-Key', cacheKey);

    try {
      // Try to get from cache
      const cachedResponse = await cacheService.get<CachedResponse>(
        options.namespace,
        cacheKey
      );

      if (cachedResponse) {
        // Handle stale-while-revalidate
        if (options.staleWhileRevalidate && isStale(cachedResponse, options)) {
          // Serve stale content immediately
          respondWithCached(res, cachedResponse, true);
          
          // Trigger background revalidation
          setImmediate(() => {
            revalidateInBackground(req, cacheService, options, cacheKey);
          });
          
          return;
        }

        // Serve cached response
        respondWithCached(res, cachedResponse, false);
        return;
      }

      // Cache miss - intercept response
      const originalSend = res.send;
      const originalJson = res.json;
      const originalStatus = res.status;
      let statusCode = 200;

      // Override status method
      res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override send method
      res.send = function(body: any) {
        // Store in cache if conditions are met
        if (shouldCache(req, res, options, statusCode)) {
          const responseToCache: CachedResponse = {
            statusCode,
            headers: extractCacheableHeaders(res),
            body,
            cachedAt: Date.now(),
            etag: res.get('ETag')
          };

          const tags = typeof options.tags === 'function'
            ? options.tags(req)
            : options.tags;

          cacheService.set(
            options.namespace,
            cacheKey,
            responseToCache,
            {
              ttl: options.ttl,
              tags: tags,
              compress: options.compress
            }
          ).catch(err => {
            console.error('Failed to cache response:', err);
          });
        }

        return originalSend.call(this, body);
      };

      // Override json method
      res.json = function(obj: any) {
        // Store in cache if conditions are met
        if (shouldCache(req, res, options, statusCode)) {
          const responseToCache: CachedResponse = {
            statusCode,
            headers: extractCacheableHeaders(res),
            body: obj,
            cachedAt: Date.now(),
            etag: res.get('ETag')
          };

          const tags = typeof options.tags === 'function'
            ? options.tags(req)
            : options.tags;

          cacheService.set(
            options.namespace,
            cacheKey,
            responseToCache,
            {
              ttl: options.ttl,
              tags: tags,
              compress: options.compress
            }
          ).catch(err => {
            console.error('Failed to cache response:', err);
          });
        }

        return originalJson.call(this, obj);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Generate default cache key from request
 */
function generateDefaultKey(req: Request): string {
  const path = req.path;
  const method = req.method;
  const query = JSON.stringify(req.query, Object.keys(req.query).sort());
  const body = req.method !== 'GET' ? JSON.stringify(req.body) : '';
  
  // Include user context if available
  const userId = (req as any).user?.id || 'anonymous';
  
  return `${method}:${path}:${query}:${body}:${userId}`;
}

/**
 * Check if response should be cached
 */
function shouldCache(
  req: Request,
  res: Response,
  options: CacheOptions,
  statusCode: number
): boolean {
  // Check custom condition
  if (options.condition && !options.condition(req, res)) {
    return false;
  }

  // Only cache successful responses
  if (statusCode >= 400) {
    return false;
  }

  // Don't cache if response has error headers
  if (res.get('X-Error') || res.get('X-Cache-Skip')) {
    return false;
  }

  // Check for no-cache headers
  const cacheControl = res.get('Cache-Control');
  if (cacheControl && cacheControl.includes('no-cache')) {
    return false;
  }

  return true;
}

/**
 * Respond with cached data
 */
function respondWithCached(
  res: Response,
  cachedResponse: CachedResponse,
  isStale: boolean = false
): void {
  // Set cached headers
  Object.entries(cachedResponse.headers).forEach(([key, value]) => {
    res.set(key, value);
  });

  // Add cache metadata
  res.set('X-Cache', isStale ? 'STALE' : 'HIT');
  res.set('X-Cache-Age', Math.floor((Date.now() - cachedResponse.cachedAt) / 1000).toString());
  
  if (cachedResponse.etag) {
    res.set('ETag', cachedResponse.etag);
  }

  // Send response
  res.status(cachedResponse.statusCode);
  
  if (typeof cachedResponse.body === 'object') {
    res.json(cachedResponse.body);
  } else {
    res.send(cachedResponse.body);
  }
}

/**
 * Extract cacheable headers
 */
function extractCacheableHeaders(res: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Headers safe to cache
  const cacheableHeaders = [
    'Content-Type',
    'Content-Encoding',
    'Content-Language',
    'Last-Modified',
    'ETag',
    'Expires',
    'Cache-Control'
  ];

  cacheableHeaders.forEach(header => {
    const value = res.get(header);
    if (value) {
      headers[header] = value;
    }
  });

  return headers;
}

/**
 * Check if cached response is stale
 */
function isStale(cachedResponse: CachedResponse, options: CacheOptions): boolean {
  if (!options.maxStaleAge) {
    return false;
  }

  const age = (Date.now() - cachedResponse.cachedAt) / 1000;
  return age > options.maxStaleAge;
}

/**
 * Revalidate cache in background
 */
async function revalidateInBackground(
  originalReq: Request,
  cacheService: CacheService,
  options: CacheOptions,
  cacheKey: string
): Promise<void> {
  try {
    console.log(`Background revalidation for key: ${cacheKey}`);
    
    // This would trigger the actual API call to refresh the cache
    // For now, we just delete the stale entry to force refresh on next request
    await cacheService.delete(options.namespace, cacheKey);
    
  } catch (error) {
    console.error('Background revalidation failed:', error);
  }
}

/**
 * Create conditional cache middleware
 */
export function conditionalCache(
  cacheService: CacheService,
  conditions: {
    namespace: CacheNamespace;
    when: (req: Request) => boolean;
    options: Omit<CacheOptions, 'namespace'>;
  }[]
) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const condition of conditions) {
      if (condition.when(req)) {
        return cacheMiddleware(cacheService, {
          ...condition.options,
          namespace: condition.namespace
        })(req, res, next);
      }
    }
    
    return next();
  };
}

/**
 * Cache invalidation middleware
 */
export function cacheInvalidationMiddleware(
  cacheService: CacheService,
  options: {
    invalidateOn?: ('POST' | 'PUT' | 'PATCH' | 'DELETE')[];
    patterns?: string[];
    namespaces?: CacheNamespace[];
    tags?: string[];
  }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Override response methods to trigger invalidation after successful operations
    const invalidateAfterResponse = async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          // Invalidate by patterns
          if (options.patterns) {
            for (const pattern of options.patterns) {
              await cacheService.invalidate({ pattern });
            }
          }
          
          // Invalidate by namespaces
          if (options.namespaces) {
            for (const namespace of options.namespaces) {
              await cacheService.invalidate({ namespace });
            }
          }
          
          // Invalidate by tags
          if (options.tags) {
            await cacheService.invalidate({ tags: options.tags });
          }
          
          console.log(`Cache invalidated after ${req.method} ${req.path}`);
        } catch (error) {
          console.error('Cache invalidation error:', error);
        }
      }
    };

    // Check if should invalidate based on HTTP method
    if (options.invalidateOn?.includes(req.method as any)) {
      res.send = function(body: any) {
        const result = originalSend.call(this, body);
        setImmediate(invalidateAfterResponse);
        return result;
      };

      res.json = function(obj: any) {
        const result = originalJson.call(this, obj);
        setImmediate(invalidateAfterResponse);
        return result;
      };
    }

    next();
  };
}

/**
 * Smart cache middleware that adapts based on request patterns
 */
export function smartCacheMiddleware(
  cacheService: CacheService,
  baseOptions: CacheOptions
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Adapt TTL based on request characteristics
    let adaptedTTL = baseOptions.ttl;
    
    // Longer TTL for aggregation queries
    if (req.path.includes('aggregation') || req.path.includes('summary')) {
      adaptedTTL = (adaptedTTL || 300) * 2;
    }
    
    // Shorter TTL for filtered queries
    if (Object.keys(req.query).length > 3) {
      adaptedTTL = Math.max(60, (adaptedTTL || 300) / 2);
    }
    
    // Very short TTL for real-time endpoints
    if (req.path.includes('realtime') || req.path.includes('live')) {
      adaptedTTL = 30;
    }

    const adaptedOptions: CacheOptions = {
      ...baseOptions,
      ttl: adaptedTTL,
      tags: (req: Request) => {
        const baseTags = typeof baseOptions.tags === 'function'
          ? baseOptions.tags(req)
          : baseOptions.tags || [];
        
        // Add dynamic tags based on query characteristics
        const dynamicTags = [];
        
        if (Object.keys(req.query).length > 0) {
          dynamicTags.push('filtered');
        }
        
        if (req.query.page || req.query.limit) {
          dynamicTags.push('paginated');
        }
        
        if (req.query.startDate || req.query.endDate) {
          dynamicTags.push('time-filtered');
        }
        
        return [...baseTags, ...dynamicTags];
      }
    };

    return cacheMiddleware(cacheService, adaptedOptions)(req, res, next);
  };
}