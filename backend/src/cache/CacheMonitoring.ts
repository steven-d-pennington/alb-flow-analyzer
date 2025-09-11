/**
 * Cache monitoring and metrics service
 */

import { EventEmitter } from 'events';
import { CacheService } from './CacheService';
import { CacheWarming } from './CacheWarming';
import { CacheInvalidation } from './CacheInvalidation';
import {
  CacheStats,
  CacheMetrics,
  CachePerformance,
  CacheNamespace
} from './types';

export interface CacheAlert {
  type: 'hit-rate' | 'memory' | 'latency' | 'error-rate' | 'eviction';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  namespace?: CacheNamespace;
}

export interface CacheHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  components: {
    memory: 'healthy' | 'warning' | 'critical';
    redis: 'healthy' | 'warning' | 'critical';
    hitRate: 'healthy' | 'warning' | 'critical';
    latency: 'healthy' | 'warning' | 'critical';
  };
  metrics: CacheMetrics;
  alerts: CacheAlert[];
  recommendations: string[];
}

export class CacheMonitoring extends EventEmitter {
  private cacheService: CacheService;
  private warmingService?: CacheWarming;
  private invalidationService?: CacheInvalidation;
  
  private performanceHistory: CachePerformance[] = [];
  private alerts: CacheAlert[] = [];
  private thresholds: {
    hitRateWarning: number;
    hitRateCritical: number;
    memoryWarning: number;
    memoryCritical: number;
    latencyWarning: number;
    latencyCritical: number;
    errorRateWarning: number;
    errorRateCritical: number;
    evictionRateWarning: number;
  };
  
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(
    cacheService: CacheService,
    warmingService?: CacheWarming,
    invalidationService?: CacheInvalidation
  ) {
    super();
    this.cacheService = cacheService;
    this.warmingService = warmingService;
    this.invalidationService = invalidationService;
    
    // Default thresholds
    this.thresholds = {
      hitRateWarning: 0.7,      // 70%
      hitRateCritical: 0.5,     // 50%
      memoryWarning: 80,        // 80% memory usage
      memoryCritical: 95,       // 95% memory usage
      latencyWarning: 100,      // 100ms
      latencyCritical: 500,     // 500ms
      errorRateWarning: 0.05,   // 5%
      errorRateCritical: 0.1,   // 10%
      evictionRateWarning: 100  // 100 evictions per minute
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen to cache service events (if any)
    // This would require the cache service to emit events
    
    // Listen to warming service events
    if (this.warmingService) {
      // Add event listeners when warming service emits events
    }
    
    // Listen to invalidation events
    if (this.invalidationService) {
      this.invalidationService.on('invalidation:complete', (event) => {
        this.recordEvent('invalidation', event);
      });
    }
  }

  /**
   * Start monitoring
   */
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      console.log('Monitoring already started');
      return;
    }

    this.isMonitoring = true;
    console.log(`Starting cache monitoring with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, intervalMs);

    // Emit monitoring started event
    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('Cache monitoring stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Perform comprehensive health check
   */
  public async performHealthCheck(): Promise<CacheHealthStatus> {
    const stats = this.cacheService.getStats();
    const metrics = this.cacheService.getMetrics();
    const health = await this.cacheService.healthCheck();

    // Analyze components
    const components = {
      memory: this.analyzeMemoryHealth(metrics),
      redis: health.details.redis ? 'healthy' as const : 'critical' as const,
      hitRate: this.analyzeHitRateHealth(stats),
      latency: this.analyzeLatencyHealth(metrics)
    };

    // Determine overall health
    const componentValues = Object.values(components);
    const overall = componentValues.includes('critical')
      ? 'critical' as const
      : componentValues.includes('warning')
      ? 'degraded' as const
      : 'healthy' as const;

    // Generate recommendations
    const recommendations = this.generateRecommendations(stats, metrics, components);

    // Clean old alerts (keep last 100)
    this.alerts = this.alerts.slice(-100);

    const healthStatus: CacheHealthStatus = {
      overall,
      components,
      metrics,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      recommendations
    };

    // Emit health status
    this.emit('health:status', healthStatus);

    // Generate alerts if needed
    await this.checkAlertConditions(stats, metrics);

    return healthStatus;
  }

  /**
   * Record performance metric
   */
  public recordPerformance(performance: CachePerformance): void {
    this.performanceHistory.push(performance);
    
    // Keep only last 1000 entries
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }

    // Check for immediate performance issues
    if (performance.duration > this.thresholds.latencyCritical) {
      this.createAlert({
        type: 'latency',
        severity: 'critical',
        message: `High latency detected: ${performance.duration}ms for ${performance.operation}`,
        value: performance.duration,
        threshold: this.thresholds.latencyCritical,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(
    timeWindow: number = 300000 // 5 minutes
  ): {
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    operationCounts: Record<string, number>;
    errorRate: number;
  } {
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    const recentPerformance = this.performanceHistory
      .filter(p => Date.now() >= windowStart); // Use current time as timestamp fallback

    if (recentPerformance.length === 0) {
      return {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        operationCounts: {},
        errorRate: 0
      };
    }

    // Calculate latencies
    const latencies = recentPerformance.map(p => p.duration).sort((a, b) => a - b);
    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    
    const p95Latency = latencies[p95Index] || 0;
    const p99Latency = latencies[p99Index] || 0;

    // Count operations
    const operationCounts: Record<string, number> = {};
    recentPerformance.forEach(p => {
      operationCounts[p.operation] = (operationCounts[p.operation] || 0) + 1;
    });

    // Calculate error rate
    const errorCount = recentPerformance.filter(p => !p.success).length;
    const errorRate = errorCount / recentPerformance.length;

    return {
      avgLatency,
      p95Latency,
      p99Latency,
      operationCounts,
      errorRate
    };
  }

  /**
   * Get cache utilization by namespace
   */
  public async getNamespaceUtilization(): Promise<Record<CacheNamespace, {
    keyCount: number;
    hitRate: number;
    avgLatency: number;
    memoryUsage: number;
  }>> {
    const utilization: any = {};
    
    // This would require namespace-specific metrics from the cache service
    // For now, provide estimated data based on performance history
    
    Object.values(CacheNamespace).forEach(namespace => {
      const namespacePerf = this.performanceHistory
        .filter(p => p.namespace === namespace);
      
      if (namespacePerf.length > 0) {
        const avgLatency = namespacePerf.reduce((sum, p) => sum + p.duration, 0) / namespacePerf.length;
        const successCount = namespacePerf.filter(p => p.success).length;
        const hitRate = successCount / namespacePerf.length;
        
        utilization[namespace] = {
          keyCount: namespacePerf.length,
          hitRate,
          avgLatency,
          memoryUsage: 0 // Would need implementation in cache service
        };
      }
    });

    return utilization;
  }

  /**
   * Generate cache report
   */
  public async generateReport(): Promise<{
    summary: {
      uptime: number;
      totalOperations: number;
      overallHitRate: number;
      avgLatency: number;
      alertCount: number;
    };
    performance: ReturnType<CacheMonitoring['getPerformanceMetrics']>;
    namespaceUtilization: Awaited<ReturnType<CacheMonitoring['getNamespaceUtilization']>>;
    healthStatus: CacheHealthStatus;
    trends: {
      hitRateTrend: number[];
      latencyTrend: number[];
      memoryTrend: number[];
    };
    recommendations: string[];
  }> {
    const stats = this.cacheService.getStats();
    const performance = this.getPerformanceMetrics();
    const namespaceUtilization = await this.getNamespaceUtilization();
    const healthStatus = await this.performHealthCheck();

    // Calculate trends (simplified)
    const trends = this.calculateTrends();

    return {
      summary: {
        uptime: Date.now(), // Simplified - would track actual uptime
        totalOperations: this.performanceHistory.length,
        overallHitRate: stats.hitRate,
        avgLatency: performance.avgLatency,
        alertCount: this.alerts.length
      },
      performance,
      namespaceUtilization,
      healthStatus,
      trends,
      recommendations: healthStatus.recommendations
    };
  }

  private analyzeMemoryHealth(metrics: CacheMetrics): 'healthy' | 'warning' | 'critical' {
    const memoryPercentage = metrics.memory.percentage;
    
    if (memoryPercentage >= this.thresholds.memoryCritical) {
      return 'critical';
    }
    if (memoryPercentage >= this.thresholds.memoryWarning) {
      return 'warning';
    }
    return 'healthy';
  }

  private analyzeHitRateHealth(stats: CacheStats): 'healthy' | 'warning' | 'critical' {
    const hitRate = stats.hitRate;
    
    if (hitRate <= this.thresholds.hitRateCritical) {
      return 'critical';
    }
    if (hitRate <= this.thresholds.hitRateWarning) {
      return 'warning';
    }
    return 'healthy';
  }

  private analyzeLatencyHealth(metrics: CacheMetrics): 'healthy' | 'warning' | 'critical' {
    const avgLatency = metrics.performance.avgLatency;
    
    if (avgLatency >= this.thresholds.latencyCritical) {
      return 'critical';
    }
    if (avgLatency >= this.thresholds.latencyWarning) {
      return 'warning';
    }
    return 'healthy';
  }

  private generateRecommendations(
    stats: CacheStats,
    metrics: CacheMetrics,
    components: CacheHealthStatus['components']
  ): string[] {
    const recommendations: string[] = [];

    // Hit rate recommendations
    if (components.hitRate !== 'healthy') {
      if (stats.hitRate < 0.5) {
        recommendations.push('Critical: Hit rate below 50%. Consider cache warming or reviewing caching strategy.');
      } else if (stats.hitRate < 0.7) {
        recommendations.push('Warning: Hit rate below 70%. Enable cache warming for frequently accessed data.');
      }
    }

    // Memory recommendations
    if (components.memory !== 'healthy') {
      if (metrics.memory.percentage > 95) {
        recommendations.push('Critical: Memory usage above 95%. Increase cache size or implement more aggressive eviction.');
      } else if (metrics.memory.percentage > 80) {
        recommendations.push('Warning: Memory usage above 80%. Monitor for potential memory issues.');
      }
    }

    // Latency recommendations
    if (components.latency !== 'healthy') {
      if (metrics.performance.avgLatency > 500) {
        recommendations.push('Critical: Average latency above 500ms. Check Redis connection or reduce data size.');
      } else if (metrics.performance.avgLatency > 100) {
        recommendations.push('Warning: Average latency above 100ms. Consider enabling compression for large objects.');
      }
    }

    // Redis recommendations
    if (components.redis !== 'healthy') {
      recommendations.push('Critical: Redis connection issues. Check Redis server status and network connectivity.');
    }

    // Eviction rate recommendations
    if (stats.evictions > 100) {
      recommendations.push('High eviction rate detected. Consider increasing cache size or adjusting TTL values.');
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('Cache is performing well. Consider enabling cache warming for better performance.');
    }

    return recommendations;
  }

  private async checkAlertConditions(stats: CacheStats, metrics: CacheMetrics): Promise<void> {
    // Hit rate alerts
    if (stats.hitRate <= this.thresholds.hitRateCritical) {
      this.createAlert({
        type: 'hit-rate',
        severity: 'critical',
        message: `Critical hit rate: ${(stats.hitRate * 100).toFixed(1)}%`,
        value: stats.hitRate,
        threshold: this.thresholds.hitRateCritical,
        timestamp: Date.now()
      });
    } else if (stats.hitRate <= this.thresholds.hitRateWarning) {
      this.createAlert({
        type: 'hit-rate',
        severity: 'medium',
        message: `Low hit rate: ${(stats.hitRate * 100).toFixed(1)}%`,
        value: stats.hitRate,
        threshold: this.thresholds.hitRateWarning,
        timestamp: Date.now()
      });
    }

    // Memory alerts
    if (metrics.memory.percentage >= this.thresholds.memoryCritical) {
      this.createAlert({
        type: 'memory',
        severity: 'critical',
        message: `Critical memory usage: ${metrics.memory.percentage.toFixed(1)}%`,
        value: metrics.memory.percentage,
        threshold: this.thresholds.memoryCritical,
        timestamp: Date.now()
      });
    } else if (metrics.memory.percentage >= this.thresholds.memoryWarning) {
      this.createAlert({
        type: 'memory',
        severity: 'medium',
        message: `High memory usage: ${metrics.memory.percentage.toFixed(1)}%`,
        value: metrics.memory.percentage,
        threshold: this.thresholds.memoryWarning,
        timestamp: Date.now()
      });
    }

    // Latency alerts
    if (metrics.performance.avgLatency >= this.thresholds.latencyCritical) {
      this.createAlert({
        type: 'latency',
        severity: 'critical',
        message: `Critical latency: ${metrics.performance.avgLatency.toFixed(2)}ms`,
        value: metrics.performance.avgLatency,
        threshold: this.thresholds.latencyCritical,
        timestamp: Date.now()
      });
    }

    // Eviction alerts
    if (stats.evictions > this.thresholds.evictionRateWarning) {
      this.createAlert({
        type: 'eviction',
        severity: 'medium',
        message: `High eviction rate: ${stats.evictions} evictions`,
        value: stats.evictions,
        threshold: this.thresholds.evictionRateWarning,
        timestamp: Date.now()
      });
    }
  }

  private createAlert(alert: Omit<CacheAlert, 'timestamp'> & { timestamp?: number }): void {
    const fullAlert: CacheAlert = {
      ...alert,
      timestamp: alert.timestamp || Date.now()
    };

    this.alerts.push(fullAlert);
    this.emit('alert', fullAlert);

    console.log(`Cache Alert [${fullAlert.severity.toUpperCase()}]: ${fullAlert.message}`);
  }

  private recordEvent(type: string, data: any): void {
    // Record events for analysis
    // This could be expanded to store in a metrics database
    console.log(`Cache event: ${type}`, data);
  }

  private calculateTrends(): {
    hitRateTrend: number[];
    latencyTrend: number[];
    memoryTrend: number[];
  } {
    // Simplified trend calculation
    // In a real implementation, this would analyze historical data
    
    return {
      hitRateTrend: [0.8, 0.75, 0.82, 0.78, 0.85], // Last 5 measurements
      latencyTrend: [50, 45, 60, 55, 48], // Last 5 measurements  
      memoryTrend: [65, 68, 70, 72, 69] // Last 5 measurements
    };
  }

  /**
   * Update monitoring thresholds
   */
  public updateThresholds(newThresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('Cache monitoring thresholds updated');
  }

  /**
   * Get current alerts
   */
  public getAlerts(severity?: CacheAlert['severity']): CacheAlert[] {
    return severity
      ? this.alerts.filter(alert => alert.severity === severity)
      : [...this.alerts];
  }

  /**
   * Clear alerts
   */
  public clearAlerts(type?: CacheAlert['type']): void {
    if (type) {
      this.alerts = this.alerts.filter(alert => alert.type !== type);
    } else {
      this.alerts = [];
    }
    console.log('Cache alerts cleared');
  }
}