/**
 * Database Optimization Script
 * Runs performance optimizations, maintains aggregation tables, and monitors performance
 */

import { ConnectionFactory } from '../database/ConnectionFactory';
import { DataStore, SqliteDataStore } from '../database/DataStore';
import { OptimizedConnectionPool } from '../database/OptimizedConnectionPool';
import { AggregationService } from '../database/AggregationService';
import { getDatabaseConfig } from '../database/config';

export interface OptimizationReport {
  timestamp: Date;
  databaseStats: any;
  performanceStats: any;
  aggregationStats: any;
  optimizationResults: {
    indexesOptimized: boolean;
    vacuumCompleted: boolean;
    aggregationUpdated: boolean;
  };
  recommendations: string[];
  processingTimeMs: number;
}

export class DatabaseOptimizer {
  private dataStore: DataStore;
  private aggregationService: AggregationService;
  private connectionPool: OptimizedConnectionPool;

  constructor(dataStore: DataStore, aggregationService: AggregationService, connectionPool: OptimizedConnectionPool) {
    this.dataStore = dataStore;
    this.aggregationService = aggregationService;
    this.connectionPool = connectionPool;
  }

  /**
   * Run comprehensive database optimization
   */
  async optimize(): Promise<OptimizationReport> {
    const startTime = Date.now();
    console.log('Starting database optimization...');

    const report: OptimizationReport = {
      timestamp: new Date(),
      databaseStats: {},
      performanceStats: {},
      aggregationStats: {},
      optimizationResults: {
        indexesOptimized: false,
        vacuumCompleted: false,
        aggregationUpdated: false
      },
      recommendations: [],
      processingTimeMs: 0
    };

    try {
      // 1. Get baseline statistics
      console.log('Collecting database statistics...');
      report.databaseStats = await this.dataStore.getStats();
      report.performanceStats = await this.dataStore.getQueryPerformanceStats();

      // 2. Optimize indexes
      console.log('Optimizing database indexes...');
      await this.dataStore.optimizeIndexes();
      report.optimizationResults.indexesOptimized = true;

      // 3. Update aggregation tables
      console.log('Updating aggregation tables...');
      const aggregationResult = await this.aggregationService.runAggregation();
      report.aggregationStats = aggregationResult;
      report.optimizationResults.aggregationUpdated = true;

      // 4. Vacuum database (SQLite only)
      if (this.isDatabaseTypeSQLite()) {
        console.log('Running database vacuum...');
        await this.dataStore.vacuum();
        report.optimizationResults.vacuumCompleted = true;
      }

      // 5. Generate performance recommendations
      report.recommendations = await this.generateRecommendations(report);

      report.processingTimeMs = Date.now() - startTime;
      console.log(`Database optimization completed in ${report.processingTimeMs}ms`);

      return report;

    } catch (error) {
      console.error('Database optimization failed:', error);
      report.processingTimeMs = Date.now() - startTime;
      report.recommendations.push(`Optimization failed: ${error instanceof Error ? error.message : String(error)}`);
      return report;
    }
  }

  /**
   * Generate performance recommendations
   */
  private async generateRecommendations(report: OptimizationReport): Promise<string[]> {
    const recommendations: string[] = [];

    // Database size recommendations
    const sizeInMB = report.databaseStats.databaseSize / (1024 * 1024);
    if (sizeInMB > 1000) { // > 1GB
      recommendations.push(`Database is large (${sizeInMB.toFixed(1)}MB). Consider archiving old data or implementing partitioning.`);
    }

    // Entry count recommendations
    if (report.databaseStats.totalEntries > 5000000) { // > 5M records
      recommendations.push('High record count detected. Consider using sampling for analysis or implementing time-based partitioning.');
    }

    // Index recommendations
    if (report.databaseStats.indexCount < 8) {
      recommendations.push('Consider adding more indexes for common query patterns. Run migrations to add performance indexes.');
    }

    // Aggregation recommendations
    if (report.aggregationStats.updated === 0) {
      recommendations.push('No aggregation data updated. Ensure aggregation service is running regularly.');
    }

    // Connection pool recommendations
    const poolStats = this.connectionPool.getStats();
    if (poolStats.waitingClients > 0) {
      recommendations.push(`Connection pool has ${poolStats.waitingClients} waiting clients. Consider increasing pool size.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Database is well optimized. No immediate actions required.');
    }

    return recommendations;
  }

  /**
   * Monitor real-time performance
   */
  async monitorPerformance(durationMs: number = 60000): Promise<any[]> {
    console.log(`Starting performance monitoring for ${durationMs / 1000}s...`);
    
    const samples: any[] = [];
    const sampleInterval = 5000; // Sample every 5 seconds
    const endTime = Date.now() + durationMs;

    while (Date.now() < endTime) {
      const sample = {
        timestamp: new Date(),
        poolStats: this.connectionPool.getStats(),
        databaseSize: await this.dataStore.getDatabaseSize()
      };

      samples.push(sample);
      await new Promise(resolve => setTimeout(resolve, sampleInterval));
    }

    console.log(`Performance monitoring completed with ${samples.length} samples`);
    return samples;
  }

  /**
   * Run automated maintenance tasks
   */
  async runMaintenance(): Promise<any> {
    console.log('Running automated database maintenance...');

    const results = {
      indexesOptimized: false,
      aggregationUpdated: false,
      oldDataCleaned: false,
      errors: [] as string[]
    };

    try {
      // Optimize indexes
      await this.dataStore.optimizeIndexes();
      results.indexesOptimized = true;

      // Update aggregations (incremental)
      const aggregationResult = await this.aggregationService.runAggregation(
        new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      );
      results.aggregationUpdated = aggregationResult.updated > 0;

      // Clean up old aggregation data (older than 90 days)
      const oldDataThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const cleanedCount = await this.aggregationService.cleanupOldAggregations(oldDataThreshold);
      results.oldDataCleaned = cleanedCount > 0;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Maintenance task failed:', errorMessage);
      results.errors.push(errorMessage);
    }

    return results;
  }

  /**
   * Check if database is SQLite
   */
  private isDatabaseTypeSQLite(): boolean {
    // This would need to be determined from the configuration
    // For now, assume SQLite if we're using SqliteDataStore
    return this.dataStore instanceof SqliteDataStore;
  }
}

/**
 * Command-line interface for database optimization
 */
async function main() {
  const config = getDatabaseConfig();
  
  try {
    // Initialize connection factory and pool
    const connectionFactory = ConnectionFactory.getInstance();
    const connectionPool = new OptimizedConnectionPool(
      config,
      (dbConfig) => connectionFactory.createConnection(dbConfig),
      {
        minConnections: 2,
        maxConnections: 10,
        acquireTimeoutMs: 10000,
        idleTimeoutMs: 300000
      }
    );

    // Initialize services
    const dataStore = new SqliteDataStore(connectionPool);
    const aggregationService = new AggregationService(connectionPool, dataStore);
    const optimizer = new DatabaseOptimizer(dataStore, aggregationService, connectionPool);

    // Parse command line arguments
    const command = process.argv[2] || 'optimize';

    switch (command) {
      case 'optimize':
        const report = await optimizer.optimize();
        console.log('\n=== Optimization Report ===');
        console.log(`Completed at: ${report.timestamp.toISOString()}`);
        console.log(`Processing time: ${report.processingTimeMs}ms`);
        console.log(`Database size: ${(report.databaseStats.databaseSize / (1024 * 1024)).toFixed(1)}MB`);
        console.log(`Total entries: ${report.databaseStats.totalEntries.toLocaleString()}`);
        console.log(`Indexes optimized: ${report.optimizationResults.indexesOptimized}`);
        console.log(`Aggregation updated: ${report.optimizationResults.aggregationUpdated}`);
        console.log(`Vacuum completed: ${report.optimizationResults.vacuumCompleted}`);
        console.log('\nRecommendations:');
        report.recommendations.forEach((rec, i) => console.log(`${i + 1}. ${rec}`));
        break;

      case 'monitor':
        const duration = parseInt(process.argv[3]) || 60000;
        const samples = await optimizer.monitorPerformance(duration);
        console.log(`\nCollected ${samples.length} performance samples`);
        console.log('Average connection pool usage:', 
          samples.reduce((sum, s) => sum + s.poolStats.activeConnections, 0) / samples.length);
        break;

      case 'maintain':
        const maintenanceResults = await optimizer.runMaintenance();
        console.log('\n=== Maintenance Results ===');
        console.log(`Indexes optimized: ${maintenanceResults.indexesOptimized}`);
        console.log(`Aggregation updated: ${maintenanceResults.aggregationUpdated}`);
        console.log(`Old data cleaned: ${maintenanceResults.oldDataCleaned}`);
        if (maintenanceResults.errors.length > 0) {
          console.log('Errors:');
          maintenanceResults.errors.forEach(err => console.log(`- ${err}`));
        }
        break;

      case 'stats':
        const stats = await dataStore.getStats();
        const perfStats = await dataStore.getQueryPerformanceStats();
        const aggStats = await aggregationService.getAggregationStats();
        
        console.log('\n=== Database Statistics ===');
        console.log(`Total entries: ${stats.totalEntries.toLocaleString()}`);
        console.log(`Database size: ${(stats.databaseSize / (1024 * 1024)).toFixed(1)}MB`);
        console.log(`Index count: ${stats.indexCount}`);
        console.log(`Date range: ${stats.oldestEntry?.toISOString()} to ${stats.newestEntry?.toISOString()}`);
        
        console.log('\nAggregation Table Stats:');
        aggStats.forEach((stat: any) => {
          console.log(`${stat.table_name}: ${stat.record_count} records (last updated: ${stat.last_updated})`);
        });
        break;

      default:
        console.log('Available commands:');
        console.log('  optimize  - Run full database optimization');
        console.log('  monitor [duration_ms] - Monitor performance');
        console.log('  maintain  - Run maintenance tasks');
        console.log('  stats     - Show database statistics');
        break;
    }

    await connectionPool.destroy();
    process.exit(0);

  } catch (error) {
    console.error('Database optimization script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { DatabaseOptimizer };