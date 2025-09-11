/**
 * Cache invalidation service for managing cache lifecycle
 */

import { EventEmitter } from 'events';
import { CacheService } from './CacheService';
import {
  CacheNamespace,
  CacheInvalidationEvent,
  InvalidationRule
} from './types';

export class CacheInvalidation extends EventEmitter {
  private cacheService: CacheService;
  private invalidationRules: Map<string, InvalidationRule[]>;
  private dependencies: Map<string, Set<string>>;

  constructor(cacheService: CacheService) {
    super();
    this.cacheService = cacheService;
    this.invalidationRules = new Map();
    this.dependencies = new Map();
    this.setupDefaultRules();
  }

  private setupDefaultRules(): void {
    // When new data is ingested, invalidate analysis and aggregations
    this.addRule('data-ingestion', [
      {
        type: 'pattern',
        pattern: `${CacheNamespace.ANALYSIS}:*`
      },
      {
        type: 'pattern',
        pattern: `${CacheNamespace.AGGREGATION}:*`
      },
      {
        type: 'pattern',
        pattern: `${CacheNamespace.WORKFLOW}:*`
      },
      {
        type: 'pattern',
        pattern: `${CacheNamespace.PATTERN}:*`
      },
      {
        type: 'tag',
        tags: ['summary', 'metrics']
      }
    ]);

    // When filters change, invalidate filtered queries
    this.addRule('filter-change', [
      {
        type: 'pattern',
        pattern: `${CacheNamespace.QUERY}:*filter*`
      },
      {
        type: 'tag',
        tags: ['filtered']
      }
    ]);

    // Time-based invalidation for session data
    this.addRule('session-expiry', [
      {
        type: 'time',
        maxAge: 900 // 15 minutes
      }
    ]);

    // Dependency-based invalidation
    this.setupDependencies();
  }

  private setupDependencies(): void {
    // Analysis depends on raw data
    this.addDependency(
      `${CacheNamespace.ANALYSIS}:*`,
      [`${CacheNamespace.QUERY}:raw*`]
    );

    // Workflows depend on analysis
    this.addDependency(
      `${CacheNamespace.WORKFLOW}:*`,
      [`${CacheNamespace.ANALYSIS}:*`]
    );

    // Aggregations depend on raw data
    this.addDependency(
      `${CacheNamespace.AGGREGATION}:*`,
      [`${CacheNamespace.QUERY}:raw*`]
    );

    // Patterns depend on sessions
    this.addDependency(
      `${CacheNamespace.PATTERN}:*`,
      [`${CacheNamespace.SESSION}:*`]
    );
  }

  /**
   * Add an invalidation rule
   */
  public addRule(trigger: string, rules: InvalidationRule[]): void {
    if (!this.invalidationRules.has(trigger)) {
      this.invalidationRules.set(trigger, []);
    }
    this.invalidationRules.get(trigger)!.push(...rules);
  }

  /**
   * Add a dependency relationship
   */
  public addDependency(parent: string, children: string[]): void {
    if (!this.dependencies.has(parent)) {
      this.dependencies.set(parent, new Set());
    }
    children.forEach(child => this.dependencies.get(parent)!.add(child));
  }

  /**
   * Handle data ingestion event
   */
  public async onDataIngestion(event: {
    type: 'file' | 's3' | 'stream';
    recordCount: number;
    timestamp: number;
  }): Promise<void> {
    console.log(`Cache invalidation: Data ingestion event (${event.recordCount} records)`);

    const invalidationEvent: CacheInvalidationEvent = {
      type: 'bulk',
      namespace: CacheNamespace.ANALYSIS,
      timestamp: event.timestamp
    };

    // Emit event for monitoring
    this.emit('invalidation:start', invalidationEvent);

    // Apply invalidation rules
    const rules = this.invalidationRules.get('data-ingestion') || [];
    let totalInvalidated = 0;

    for (const rule of rules) {
      const count = await this.applyRule(rule);
      totalInvalidated += count;
    }

    // For large datasets (2M+ records), be selective about invalidation
    if (event.recordCount > 100000) {
      // Only invalidate high-level summaries, keep granular data cached
      await this.cacheService.invalidate({
        tags: ['summary', 'aggregate']
      });
    } else {
      // For smaller updates, invalidate more aggressively
      await this.cacheService.invalidate({
        namespace: CacheNamespace.ANALYSIS
      });
      await this.cacheService.invalidate({
        namespace: CacheNamespace.WORKFLOW
      });
    }

    console.log(`Cache invalidation complete: ${totalInvalidated} entries invalidated`);
    this.emit('invalidation:complete', {
      ...invalidationEvent,
      invalidatedCount: totalInvalidated
    });
  }

  /**
   * Handle filter change event
   */
  public async onFilterChange(filters: any): Promise<void> {
    console.log('Cache invalidation: Filter change event');

    const rules = this.invalidationRules.get('filter-change') || [];
    
    for (const rule of rules) {
      await this.applyRule(rule);
    }

    // Invalidate specific filter combinations
    const filterKey = this.cacheService.hashKey(filters);
    await this.cacheService.invalidate({
      pattern: `*:filter:${filterKey}`
    });
  }

  /**
   * Handle update to specific entity
   */
  public async onEntityUpdate(
    namespace: CacheNamespace,
    entityId: string
  ): Promise<void> {
    console.log(`Cache invalidation: Entity update ${namespace}:${entityId}`);

    // Invalidate the specific entity
    await this.cacheService.delete(namespace, entityId);

    // Invalidate dependent caches
    await this.invalidateDependents(`${namespace}:${entityId}`);
  }

  /**
   * Apply a single invalidation rule
   */
  private async applyRule(rule: InvalidationRule): Promise<number> {
    switch (rule.type) {
      case 'pattern':
        if (rule.pattern) {
          return await this.cacheService.invalidate({
            pattern: rule.pattern
          });
        }
        break;

      case 'tag':
        if (rule.tags) {
          return await this.cacheService.invalidate({
            tags: rule.tags
          });
        }
        break;

      case 'time':
        // Time-based invalidation handled by TTL
        // This is a placeholder for custom time-based logic
        break;

      case 'dependency':
        if (rule.dependencies) {
          let count = 0;
          for (const dep of rule.dependencies) {
            count += await this.invalidateDependents(dep);
          }
          return count;
        }
        break;
    }

    return 0;
  }

  /**
   * Invalidate dependent caches
   */
  private async invalidateDependents(pattern: string): Promise<number> {
    let totalInvalidated = 0;

    for (const [parent, children] of this.dependencies.entries()) {
      if (this.matchesPattern(pattern, parent)) {
        for (const child of children) {
          const count = await this.cacheService.invalidate({
            pattern: child
          });
          totalInvalidated += count;
        }
      }
    }

    return totalInvalidated;
  }

  /**
   * Check if a key matches a pattern
   */
  private matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(key);
  }

  /**
   * Schedule periodic cleanup for time-based invalidation
   */
  public startPeriodicCleanup(intervalMs: number = 60000): void {
    setInterval(async () => {
      try {
        await this.performTimeBasedCleanup();
      } catch (error) {
        console.error('Periodic cache cleanup error:', error);
      }
    }, intervalMs);
  }

  /**
   * Perform time-based cleanup
   */
  private async performTimeBasedCleanup(): Promise<void> {
    const rules = Array.from(this.invalidationRules.values())
      .flat()
      .filter(rule => rule.type === 'time');

    for (const rule of rules) {
      if (rule.maxAge) {
        // This would require tracking creation time in cache metadata
        // For now, rely on TTL-based expiration
        console.log(`Time-based cleanup: maxAge=${rule.maxAge}s`);
      }
    }
  }

  /**
   * Smart invalidation based on data changes
   */
  public async smartInvalidate(changes: {
    added?: number;
    modified?: number;
    deleted?: number;
    timeRange?: { start: Date; end: Date };
  }): Promise<void> {
    const totalChanges = (changes.added || 0) + (changes.modified || 0) + (changes.deleted || 0);
    
    // Determine invalidation strategy based on change volume
    if (totalChanges === 0) {
      return;
    }

    // For small changes (< 1% of 2M records = 20k)
    if (totalChanges < 20000) {
      // Selective invalidation
      if (changes.timeRange) {
        // Invalidate only data within the time range
        const rangeKey = this.cacheService.hashKey(changes.timeRange);
        await this.cacheService.invalidate({
          pattern: `*:range:${rangeKey}`
        });
      }

      // Invalidate summaries but keep detailed data
      await this.cacheService.invalidate({
        tags: ['summary']
      });
    } 
    // For medium changes (1-10% = 20k-200k)
    else if (totalChanges < 200000) {
      // Invalidate analysis and aggregations
      await this.cacheService.invalidate({
        namespace: CacheNamespace.ANALYSIS
      });
      await this.cacheService.invalidate({
        namespace: CacheNamespace.AGGREGATION
      });
      
      // Keep query cache for unchanged data
    }
    // For large changes (> 10% = 200k+)
    else {
      // Full cache invalidation for consistency
      await this.cacheService.clear();
      console.log('Full cache clear due to large data changes');
      
      // Trigger cache warming for critical queries
      this.emit('warmup:needed', { reason: 'large-invalidation' });
    }
  }
}