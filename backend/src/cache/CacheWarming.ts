/**
 * Cache warming service for preloading frequently accessed data
 */

import { CacheService } from './CacheService';
import { CacheInvalidation } from './CacheInvalidation';
import PQueue from 'p-queue';
import {
  CacheNamespace,
  WarmupConfig,
  WarmupQuery
} from './types';

export class CacheWarming {
  private cacheService: CacheService;
  private invalidationService: CacheInvalidation;
  private queue: PQueue;
  private warmupQueries: Map<string, WarmupQuery>;
  private isWarming: boolean = false;
  private warmupStats: {
    totalQueries: number;
    successfulWarmups: number;
    failedWarmups: number;
    lastWarmupTime: number;
    avgWarmupDuration: number;
  };

  constructor(
    cacheService: CacheService,
    invalidationService: CacheInvalidation,
    config?: { maxConcurrency?: number }
  ) {
    this.cacheService = cacheService;
    this.invalidationService = invalidationService;
    this.queue = new PQueue({
      concurrency: config?.maxConcurrency || 3,
      intervalCap: 5,
      interval: 1000 // Rate limit: 5 operations per second
    });
    this.warmupQueries = new Map();
    this.warmupStats = {
      totalQueries: 0,
      successfulWarmups: 0,
      failedWarmups: 0,
      lastWarmupTime: 0,
      avgWarmupDuration: 0
    };

    this.setupDefaultWarmupQueries();
    this.setupEventListeners();
  }

  private setupDefaultWarmupQueries(): void {
    // High-priority warmup queries for 2M+ record scenarios

    // 1. Overall traffic summary
    this.addWarmupQuery({
      namespace: CacheNamespace.ANALYSIS,
      key: 'traffic-summary',
      priority: 1,
      generator: async () => {
        // This will be replaced with actual analysis engine call
        return {
          key: 'traffic-summary',
          placeholder: 'overall-traffic-metrics'
        };
      }
    });

    // 2. Last 24 hours analysis
    this.addWarmupQuery({
      namespace: CacheNamespace.ANALYSIS,
      key: 'last-24h',
      priority: 1,
      generator: async () => {
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        return {
          key: 'last-24h',
          timeRange: { start, end }
        };
      }
    });

    // 3. Status code distribution
    this.addWarmupQuery({
      namespace: CacheNamespace.AGGREGATION,
      key: 'status-codes',
      priority: 2,
      generator: async () => {
        return {
          key: 'status-code-distribution',
          placeholder: 'status-aggregation'
        };
      }
    });

    // 4. Top endpoints
    this.addWarmupQuery({
      namespace: CacheNamespace.AGGREGATION,
      key: 'top-endpoints',
      priority: 2,
      generator: async () => {
        return {
          key: 'top-endpoints',
          placeholder: 'endpoint-stats'
        };
      }
    });

    // 5. Error patterns
    this.addWarmupQuery({
      namespace: CacheNamespace.PATTERN,
      key: 'error-patterns',
      priority: 3,
      generator: async () => {
        return {
          key: 'error-patterns',
          placeholder: 'error-analysis'
        };
      }
    });

    // 6. Peak periods
    this.addWarmupQuery({
      namespace: CacheNamespace.ANALYSIS,
      key: 'peak-periods',
      priority: 3,
      generator: async () => {
        return {
          key: 'peak-periods',
          placeholder: 'peak-analysis'
        };
      }
    });

    // 7. Response time percentiles
    this.addWarmupQuery({
      namespace: CacheNamespace.AGGREGATION,
      key: 'response-times',
      priority: 2,
      generator: async () => {
        return {
          key: 'response-time-percentiles',
          placeholder: 'response-time-stats'
        };
      }
    });

    // 8. Recent workflow analyses (for users who frequently check workflows)
    this.addWarmupQuery({
      namespace: CacheNamespace.WORKFLOW,
      key: 'recent-workflows',
      priority: 4,
      generator: async () => {
        return {
          key: 'recent-workflows',
          placeholder: 'workflow-summaries'
        };
      }
    });
  }

  private setupEventListeners(): void {
    // Listen for invalidation events that trigger warmup
    this.invalidationService.on('warmup:needed', (event) => {
      console.log('Cache warmup triggered by:', event.reason);
      this.scheduleWarmup();
    });

    // Listen for invalidation completion to trigger selective warmup
    this.invalidationService.on('invalidation:complete', (event) => {
      if (event.invalidatedCount > 50) {
        // Only warm up if significant invalidation occurred
        this.scheduleWarmup(['high-priority']);
      }
    });
  }

  /**
   * Add a warmup query
   */
  public addWarmupQuery(query: WarmupQuery): void {
    const key = `${query.namespace}:${query.key}`;
    this.warmupQueries.set(key, query);
  }

  /**
   * Remove a warmup query
   */
  public removeWarmupQuery(namespace: CacheNamespace, key: string): void {
    const fullKey = `${namespace}:${key}`;
    this.warmupQueries.delete(fullKey);
  }

  /**
   * Schedule cache warmup
   */
  public async scheduleWarmup(priorities?: string[]): Promise<void> {
    if (this.isWarming) {
      console.log('Warmup already in progress, skipping...');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      console.log('Starting cache warmup...');
      
      // Get queries sorted by priority
      const queries = Array.from(this.warmupQueries.values())
        .sort((a, b) => (a.priority || 10) - (b.priority || 10));

      // Filter by priorities if specified
      const filteredQueries = priorities
        ? queries.filter(q => priorities.includes(this.getPriorityLevel(q.priority || 10)))
        : queries;

      // Add all queries to the queue
      const promises = filteredQueries.map(query => 
        this.queue.add(() => this.executeWarmupQuery(query))
      );

      // Wait for all queries to complete
      const results = await Promise.allSettled(promises);

      // Update stats
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      this.warmupStats.totalQueries += queries.length;
      this.warmupStats.successfulWarmups += successful;
      this.warmupStats.failedWarmups += failed;
      this.warmupStats.lastWarmupTime = Date.now();
      
      const duration = Date.now() - startTime;
      this.warmupStats.avgWarmupDuration = 
        (this.warmupStats.avgWarmupDuration + duration) / 2;

      console.log(`Cache warmup completed: ${successful} successful, ${failed} failed (${duration}ms)`);
    } catch (error) {
      console.error('Cache warmup error:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Execute a single warmup query
   */
  private async executeWarmupQuery(query: WarmupQuery): Promise<void> {
    const startTime = Date.now();
    const cacheKey = `${query.namespace}:${query.key}`;

    try {
      // Check if already cached
      const existing = await this.cacheService.get(query.namespace, query.key);
      if (existing) {
        console.log(`Warmup skipped (already cached): ${cacheKey}`);
        return;
      }

      console.log(`Warming up: ${cacheKey}`);

      // Generate the data
      const data = await query.generator();

      // Store in cache with appropriate TTL
      const success = await this.cacheService.set(
        query.namespace,
        query.key,
        data,
        {
          tags: ['warmed-up', `priority-${query.priority || 10}`],
          compress: true
        }
      );

      if (success) {
        const duration = Date.now() - startTime;
        console.log(`Warmup completed: ${cacheKey} (${duration}ms)`);
      } else {
        throw new Error('Failed to store warmed data');
      }
    } catch (error) {
      console.error(`Warmup failed for ${cacheKey}:`, error);
      throw error;
    }
  }

  /**
   * Get priority level string
   */
  private getPriorityLevel(priority: number): string {
    if (priority <= 1) return 'critical';
    if (priority <= 2) return 'high-priority';
    if (priority <= 3) return 'medium-priority';
    return 'low-priority';
  }

  /**
   * Smart warmup based on usage patterns
   */
  public async smartWarmup(options: {
    timeOfDay?: 'morning' | 'business' | 'evening';
    dayOfWeek?: 'weekday' | 'weekend';
    userType?: 'analyst' | 'admin' | 'viewer';
  }): Promise<void> {
    console.log('Starting smart warmup with options:', options);

    // Determine which queries to warm based on context
    const queriesToWarm: WarmupQuery[] = [];

    // Morning warmup - focus on overnight summaries
    if (options.timeOfDay === 'morning') {
      const morningQueries = Array.from(this.warmupQueries.values())
        .filter(q => ['traffic-summary', 'last-24h', 'error-patterns'].includes(q.key))
        .sort((a, b) => (a.priority || 10) - (b.priority || 10));
      
      queriesToWarm.push(...morningQueries);
    }

    // Business hours - focus on operational dashboards
    if (options.timeOfDay === 'business') {
      const businessQueries = Array.from(this.warmupQueries.values())
        .filter(q => ['status-codes', 'top-endpoints', 'response-times'].includes(q.key));
      
      queriesToWarm.push(...businessQueries);
    }

    // Analyst users - warm up detailed analysis data
    if (options.userType === 'analyst') {
      const analystQueries = Array.from(this.warmupQueries.values())
        .filter(q => q.namespace === CacheNamespace.ANALYSIS || q.namespace === CacheNamespace.PATTERN);
      
      queriesToWarm.push(...analystQueries);
    }

    // Execute warmup for selected queries
    if (queriesToWarm.length > 0) {
      const promises = queriesToWarm.map(query => 
        this.queue.add(() => this.executeWarmupQuery(query))
      );

      await Promise.allSettled(promises);
      console.log(`Smart warmup completed for ${queriesToWarm.length} queries`);
    }
  }

  /**
   * Predictive warmup based on access patterns
   */
  public async predictiveWarmup(accessLog: {
    namespace: CacheNamespace;
    key: string;
    timestamp: number;
    frequency: number;
  }[]): Promise<void> {
    // Analyze access patterns
    const patterns = this.analyzeAccessPatterns(accessLog);
    
    // Generate warmup candidates based on patterns
    const candidates = this.generateWarmupCandidates(patterns);
    
    // Execute warmup for high-probability candidates
    const promises = candidates.map(query => 
      this.queue.add(() => this.executeWarmupQuery(query))
    );

    await Promise.allSettled(promises);
    console.log(`Predictive warmup completed for ${candidates.length} predicted queries`);
  }

  private analyzeAccessPatterns(accessLog: any[]): Map<string, any> {
    const patterns = new Map();
    
    // Group by time windows
    const hourlyAccess = new Map();
    const dailyAccess = new Map();
    
    for (const entry of accessLog) {
      const hour = new Date(entry.timestamp).getHours();
      const day = new Date(entry.timestamp).getDay();
      
      const key = `${entry.namespace}:${entry.key}`;
      
      // Hourly patterns
      if (!hourlyAccess.has(hour)) {
        hourlyAccess.set(hour, new Map());
      }
      hourlyAccess.get(hour).set(key, (hourlyAccess.get(hour).get(key) || 0) + 1);
      
      // Daily patterns
      if (!dailyAccess.has(day)) {
        dailyAccess.set(day, new Map());
      }
      dailyAccess.get(day).set(key, (dailyAccess.get(day).get(key) || 0) + 1);
    }
    
    patterns.set('hourly', hourlyAccess);
    patterns.set('daily', dailyAccess);
    
    return patterns;
  }

  private generateWarmupCandidates(patterns: Map<string, any>): WarmupQuery[] {
    const candidates: WarmupQuery[] = [];
    
    // Current hour patterns
    const currentHour = new Date().getHours();
    const hourlyPatterns = patterns.get('hourly');
    
    if (hourlyPatterns && hourlyPatterns.has(currentHour)) {
      const hourData = hourlyPatterns.get(currentHour);
      
      for (const [key, frequency] of hourData.entries()) {
        if (frequency > 2) { // Accessed more than twice in this hour historically
          const [namespace, queryKey] = key.split(':', 2);
          
          candidates.push({
            namespace: namespace as CacheNamespace,
            key: queryKey,
            priority: Math.max(1, 10 - frequency), // Higher frequency = higher priority
            generator: async () => ({ predictive: true, key: queryKey })
          });
        }
      }
    }
    
    return candidates.slice(0, 10); // Limit to top 10 predictions
  }

  /**
   * Get warmup statistics
   */
  public getStats(): typeof this.warmupStats {
    return { ...this.warmupStats };
  }

  /**
   * Clear warmup queue
   */
  public clearQueue(): void {
    this.queue.clear();
    console.log('Warmup queue cleared');
  }

  /**
   * Set up periodic warmup schedule
   */
  public setupPeriodicWarmup(schedules: {
    interval: number; // milliseconds
    queries?: string[]; // Query keys to warm, empty = all
    maxDuration?: number; // Max time to spend on warmup
  }[]): void {
    schedules.forEach((schedule, index) => {
      setInterval(async () => {
        try {
          const startTime = Date.now();
          
          if (schedule.queries && schedule.queries.length > 0) {
            // Warm specific queries
            const queriesToWarm = Array.from(this.warmupQueries.values())
              .filter(q => schedule.queries!.includes(q.key));
            
            const promises = queriesToWarm.map(query => 
              this.queue.add(() => this.executeWarmupQuery(query))
            );
            
            await Promise.race([
              Promise.allSettled(promises),
              new Promise(resolve => setTimeout(resolve, schedule.maxDuration || 30000))
            ]);
          } else {
            // Full warmup with time limit
            await Promise.race([
              this.scheduleWarmup(),
              new Promise(resolve => setTimeout(resolve, schedule.maxDuration || 60000))
            ]);
          }
          
          console.log(`Periodic warmup ${index} completed in ${Date.now() - startTime}ms`);
        } catch (error) {
          console.error(`Periodic warmup ${index} error:`, error);
        }
      }, schedule.interval);
    });

    console.log(`Set up ${schedules.length} periodic warmup schedules`);
  }
}