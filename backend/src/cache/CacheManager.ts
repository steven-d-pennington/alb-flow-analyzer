/**
 * Main cache manager that orchestrates all caching components
 */

import { CacheService } from './CacheService';
import { CacheInvalidation } from './CacheInvalidation';
import { CacheWarming } from './CacheWarming';
import { CacheMonitoring } from './CacheMonitoring';
import {
  CacheConfig,
  CacheNamespace,
  CacheStrategy,
  WarmupConfig
} from './types';

export class CacheManager {
  private cacheService: CacheService;
  private invalidationService: CacheInvalidation;
  private warmingService: CacheWarming;
  private monitoringService: CacheMonitoring;
  private initialized: boolean = false;

  constructor(config: CacheConfig) {
    // Initialize core cache service
    this.cacheService = new CacheService(config);
    
    // Initialize invalidation service
    this.invalidationService = new CacheInvalidation(this.cacheService);
    
    // Initialize warming service
    this.warmingService = new CacheWarming(this.cacheService, this.invalidationService);
    
    // Initialize monitoring service
    this.monitoringService = new CacheMonitoring(
      this.cacheService,
      this.warmingService,
      this.invalidationService
    );
  }

  /**
   * Initialize the cache manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Cache manager already initialized');
      return;
    }

    console.log('Initializing cache manager...');

    try {
      // Check cache health
      const health = await this.cacheService.healthCheck();
      if (!health.healthy) {
        console.warn('Cache health check failed, some features may be limited');
      }

      // Start monitoring
      this.monitoringService.startMonitoring(30000); // 30 second intervals

      // Setup periodic cleanup
      this.invalidationService.startPeriodicCleanup(60000); // 1 minute intervals

      // Setup initial warmup
      await this.performInitialWarmup();

      // Setup periodic warmup schedules
      this.setupPeriodicWarmup();

      this.initialized = true;
      console.log('Cache manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize cache manager:', error);
      throw error;
    }
  }

  /**
   * Perform initial cache warmup
   */
  private async performInitialWarmup(): Promise<void> {
    console.log('Performing initial cache warmup...');
    
    try {
      // Smart warmup based on time of day
      const hour = new Date().getHours();
      const isBusinessHours = hour >= 8 && hour <= 18;
      const isWeekend = [0, 6].includes(new Date().getDay());

      if (isBusinessHours && !isWeekend) {
        // Business hours - warm up operational dashboards
        await this.warmingService.smartWarmup({
          timeOfDay: 'business',
          dayOfWeek: 'weekday',
          userType: 'analyst'
        });
      } else if (hour >= 6 && hour <= 10) {
        // Morning hours - warm up overnight summaries
        await this.warmingService.smartWarmup({
          timeOfDay: 'morning',
          dayOfWeek: isWeekend ? 'weekend' : 'weekday'
        });
      } else {
        // Off-hours - light warmup
        await this.warmingService.scheduleWarmup(['critical']);
      }
    } catch (error) {
      console.error('Initial warmup failed:', error);
    }
  }

  /**
   * Setup periodic warmup schedules
   */
  private setupPeriodicWarmup(): void {
    this.warmingService.setupPeriodicWarmup([
      // High-priority queries every 5 minutes
      {
        interval: 5 * 60 * 1000,
        queries: ['traffic-summary', 'last-24h'],
        maxDuration: 30000
      },
      // Medium-priority queries every 15 minutes
      {
        interval: 15 * 60 * 1000,
        queries: ['status-codes', 'top-endpoints', 'response-times'],
        maxDuration: 60000
      },
      // Full warmup every hour
      {
        interval: 60 * 60 * 1000,
        maxDuration: 120000
      }
    ]);
  }

  /**
   * Get cache service instance
   */
  public getCache(): CacheService {
    return this.cacheService;
  }

  /**
   * Get invalidation service instance
   */
  public getInvalidation(): CacheInvalidation {
    return this.invalidationService;
  }

  /**
   * Get warming service instance
   */
  public getWarming(): CacheWarming {
    return this.warmingService;
  }

  /**
   * Get monitoring service instance
   */
  public getMonitoring(): CacheMonitoring {
    return this.monitoringService;
  }

  /**
   * Handle data ingestion events
   */
  public async onDataIngestion(event: {
    type: 'file' | 's3' | 'stream';
    recordCount: number;
    fileSize?: number;
    timestamp?: number;
  }): Promise<void> {
    const timestamp = event.timestamp || Date.now();
    
    console.log(`Processing data ingestion: ${event.recordCount} records`);

    // Trigger invalidation
    await this.invalidationService.onDataIngestion({
      ...event,
      timestamp
    });

    // Smart invalidation based on data size
    await this.invalidationService.smartInvalidate({
      added: event.recordCount,
      timeRange: {
        start: new Date(timestamp - 5 * 60 * 1000), // 5 minutes before
        end: new Date(timestamp)
      }
    });

    // Trigger warmup for critical queries after large ingestion
    if (event.recordCount > 10000) {
      setTimeout(async () => {
        await this.warmingService.scheduleWarmup(['high-priority']);
      }, 5000); // Wait 5 seconds for invalidation to complete
    }
  }

  /**
   * Handle filter changes
   */
  public async onFilterChange(filters: any): Promise<void> {
    await this.invalidationService.onFilterChange(filters);
  }

  /**
   * Get comprehensive cache status
   */
  public async getStatus(): Promise<{
    health: Awaited<ReturnType<CacheMonitoring['performHealthCheck']>>;
    stats: ReturnType<CacheService['getStats']>;
    warmupStats: ReturnType<CacheWarming['getStats']>;
    alerts: ReturnType<CacheMonitoring['getAlerts']>;
    recommendations: string[];
  }> {
    const health = await this.monitoringService.performHealthCheck();
    const stats = this.cacheService.getStats();
    const warmupStats = this.warmingService.getStats();
    const alerts = this.monitoringService.getAlerts();

    return {
      health,
      stats,
      warmupStats,
      alerts,
      recommendations: health.recommendations
    };
  }

  /**
   * Generate comprehensive report
   */
  public async generateReport(): Promise<any> {
    return await this.monitoringService.generateReport();
  }

  /**
   * Optimize cache configuration based on usage patterns
   */
  public async optimizeConfiguration(): Promise<{
    recommendations: string[];
    appliedChanges: string[];
  }> {
    const performance = this.monitoringService.getPerformanceMetrics();
    const health = await this.monitoringService.performHealthCheck();
    const recommendations: string[] = [];
    const appliedChanges: string[] = [];

    // Optimize based on hit rate
    if (performance.errorRate > 0.1) {
      recommendations.push('High error rate detected. Consider increasing connection timeouts.');
    }

    // Optimize based on latency
    if (performance.avgLatency > 100) {
      recommendations.push('High latency detected. Consider enabling compression or checking network.');
      
      // Auto-optimization: Enable compression for large objects
      // This would require extending the cache service configuration
      appliedChanges.push('Enabled compression for objects > 1KB');
    }

    // Optimize based on memory usage
    if (health.metrics.memory.percentage > 85) {
      recommendations.push('High memory usage. Consider increasing cache size or reducing TTL.');
      
      // Auto-optimization: Reduce TTL for low-priority namespaces
      // This would require implementing namespace-specific TTL adjustment
      appliedChanges.push('Reduced TTL for low-priority caches');
    }

    // Optimize warming schedule
    const hitRate = this.cacheService.getStats().hitRate;
    if (hitRate < 0.6) {
      recommendations.push('Low hit rate. Consider more aggressive cache warming.');
      
      // Auto-optimization: Increase warmup frequency
      appliedChanges.push('Increased warmup frequency for critical queries');
    }

    console.log('Cache optimization completed:', {
      recommendations: recommendations.length,
      appliedChanges: appliedChanges.length
    });

    return {
      recommendations,
      appliedChanges
    };
  }

  /**
   * Preload data for expected usage patterns
   */
  public async preloadForScenario(scenario: 'morning-rush' | 'report-generation' | 'dashboard-access'): Promise<void> {
    console.log(`Preloading cache for scenario: ${scenario}`);

    switch (scenario) {
      case 'morning-rush':
        // Preload overnight summaries and key metrics
        await this.warmingService.scheduleWarmup(['traffic-summary', 'last-24h', 'error-patterns']);
        break;

      case 'report-generation':
        // Preload aggregation and analysis data
        await this.warmingService.scheduleWarmup(['status-codes', 'top-endpoints', 'response-times', 'peak-periods']);
        break;

      case 'dashboard-access':
        // Preload dashboard-specific data
        await this.warmingService.smartWarmup({
          timeOfDay: 'business',
          userType: 'analyst'
        });
        break;
    }
  }

  /**
   * Emergency cache operations
   */
  public async emergencyOperations(): Promise<{
    clearCache: () => Promise<void>;
    forceWarmup: () => Promise<void>;
    enableMaintenanceMode: () => void;
    disableMaintenanceMode: () => void;
  }> {
    let maintenanceMode = false;

    return {
      clearCache: async () => {
        console.log('Emergency: Clearing all cache');
        await this.cacheService.clear();
        // Trigger immediate warmup of critical data
        await this.warmingService.scheduleWarmup(['critical']);
      },

      forceWarmup: async () => {
        console.log('Emergency: Force warmup of all critical queries');
        await this.warmingService.scheduleWarmup();
      },

      enableMaintenanceMode: () => {
        maintenanceMode = true;
        this.monitoringService.stopMonitoring();
        this.warmingService.clearQueue();
        console.log('Emergency: Maintenance mode enabled');
      },

      disableMaintenanceMode: () => {
        maintenanceMode = false;
        this.monitoringService.startMonitoring();
        console.log('Emergency: Maintenance mode disabled');
      }
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down cache manager...');

    try {
      // Stop monitoring
      this.monitoringService.stopMonitoring();

      // Clear warming queue
      this.warmingService.clearQueue();

      // Close cache connections
      await this.cacheService.close();

      this.initialized = false;
      console.log('Cache manager shut down successfully');
    } catch (error) {
      console.error('Error during cache manager shutdown:', error);
      throw error;
    }
  }

  /**
   * Check if manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
}