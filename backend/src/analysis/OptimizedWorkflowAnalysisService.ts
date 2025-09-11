/**
 * Optimized Workflow Analysis Service for handling large datasets (2M+ records)
 * Uses streaming, aggregation tables, and performance optimizations
 */

import { SessionReconstruction, Session, SessionConfig } from './SessionReconstruction';
import { PatternDiscovery, WorkflowAnalysis, WorkflowPattern } from './PatternDiscovery';
import { DataStore, FilterCriteria, QueryOptions } from '../database/DataStore';
import { 
  WorkflowInsight, 
  WorkflowSummary, 
  WorkflowAnalysisOptions, 
  WorkflowAnalysisResult 
} from './WorkflowAnalysisService';

export interface OptimizedAnalysisConfig {
  maxSessionsForFullAnalysis: number;
  useSampling: boolean;
  samplingRate: number;
  useAggregationTables: boolean;
  streamingBatchSize: number;
  maxProcessingTimeMs: number;
  enableCaching: boolean;
  cacheExpiryMs: number;
}

export interface StreamingAnalysisProgress {
  phase: 'fetching' | 'processing_sessions' | 'analyzing_patterns' | 'generating_summary' | 'completed';
  progress: number; // 0-100
  processedRecords: number;
  totalRecords?: number;
  currentBatch?: number;
  totalBatches?: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
}

export class OptimizedWorkflowAnalysisService {
  private sessionReconstruction: SessionReconstruction;
  private patternDiscovery: PatternDiscovery;
  private dataStore: DataStore;
  private config: OptimizedAnalysisConfig;
  private progressCallback?: (progress: StreamingAnalysisProgress) => void;
  private analysisCache = new Map<string, { result: WorkflowAnalysisResult; timestamp: number }>();

  constructor(
    dataStore: DataStore,
    sessionConfig?: Partial<SessionConfig>,
    config?: Partial<OptimizedAnalysisConfig>
  ) {
    this.dataStore = dataStore;
    this.sessionReconstruction = new SessionReconstruction(sessionConfig);
    this.patternDiscovery = new PatternDiscovery();
    
    this.config = {
      maxSessionsForFullAnalysis: config?.maxSessionsForFullAnalysis ?? 10000,
      useSampling: config?.useSampling ?? true,
      samplingRate: config?.samplingRate ?? 0.1, // 10% sampling for large datasets
      useAggregationTables: config?.useAggregationTables ?? true,
      streamingBatchSize: config?.streamingBatchSize ?? 5000,
      maxProcessingTimeMs: config?.maxProcessingTimeMs ?? 300000, // 5 minutes max
      enableCaching: config?.enableCaching ?? true,
      cacheExpiryMs: config?.cacheExpiryMs ?? 1800000 // 30 minutes
    };
  }

  /**
   * Set progress callback for streaming analysis
   */
  setProgressCallback(callback: (progress: StreamingAnalysisProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Optimized workflow analysis that can handle millions of records
   */
  async analyzeWorkflowsOptimized(
    filters?: FilterCriteria, 
    options?: WorkflowAnalysisOptions
  ): Promise<WorkflowAnalysisResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(filters, options);

    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        console.log('Returning cached workflow analysis result');
        return cached;
      }
    }

    try {
      // Get total count to determine analysis strategy
      const totalCount = await this.dataStore.count(filters);
      console.log(`Total records to analyze: ${totalCount.toLocaleString()}`);

      this.reportProgress({
        phase: 'fetching',
        progress: 5,
        processedRecords: 0,
        totalRecords: totalCount,
        elapsedMs: Date.now() - startTime
      });

      let result: WorkflowAnalysisResult;

      if (totalCount <= this.config.maxSessionsForFullAnalysis) {
        // Small dataset - use traditional analysis
        result = await this.performFullAnalysis(filters, options, startTime);
      } else if (this.config.useAggregationTables && await this.hasAggregationData(filters)) {
        // Large dataset with aggregation data - use fast aggregated analysis
        result = await this.performAggregatedAnalysis(filters, options, startTime);
      } else {
        // Large dataset without aggregation - use streaming with sampling
        result = await this.performStreamingAnalysis(filters, options, startTime);
      }

      // Cache result
      if (this.config.enableCaching) {
        this.setCachedResult(cacheKey, result);
      }

      this.reportProgress({
        phase: 'completed',
        progress: 100,
        processedRecords: result.sessions.length,
        totalRecords: totalCount,
        elapsedMs: result.processingTime
      });

      return result;

    } catch (error) {
      console.error('Optimized workflow analysis failed:', error);
      throw error;
    }
  }

  /**
   * Traditional full analysis for smaller datasets
   */
  private async performFullAnalysis(
    filters?: FilterCriteria, 
    options?: WorkflowAnalysisOptions,
    startTime: number = Date.now()
  ): Promise<WorkflowAnalysisResult> {
    console.log('Performing full analysis for small dataset');

    this.reportProgress({
      phase: 'fetching',
      progress: 10,
      processedRecords: 0,
      elapsedMs: Date.now() - startTime
    });

    // Fetch all entries with optimizations
    const queryOptions: QueryOptions = {
      batchSize: 5000,
      timeoutMs: 60000,
      useAggregation: false
    };

    let entries = await this.dataStore.query(filters, queryOptions);
    
    // Apply workflow-specific filtering
    if (options) {
      entries = this.applyWorkflowFilters(entries, options);
    }

    this.reportProgress({
      phase: 'processing_sessions',
      progress: 30,
      processedRecords: entries.length,
      elapsedMs: Date.now() - startTime
    });

    // Reconstruct sessions
    const sessions = this.sessionReconstruction.reconstructSessions(entries);

    this.reportProgress({
      phase: 'analyzing_patterns',
      progress: 70,
      processedRecords: sessions.length,
      elapsedMs: Date.now() - startTime
    });

    // Discover patterns
    const analysis = this.patternDiscovery.discoverPatterns(sessions);

    this.reportProgress({
      phase: 'generating_summary',
      progress: 90,
      processedRecords: sessions.length,
      elapsedMs: Date.now() - startTime
    });

    // Generate summary
    const summary = this.generateOptimizedSummary(sessions, analysis);

    return {
      sessions,
      analysis,
      summary,
      processingTime: Date.now() - startTime,
      timestamp: new Date(),
      appliedFilters: options || {}
    };
  }

  /**
   * Fast aggregated analysis using pre-computed summary tables
   */
  private async performAggregatedAnalysis(
    filters?: FilterCriteria, 
    options?: WorkflowAnalysisOptions,
    startTime: number = Date.now()
  ): Promise<WorkflowAnalysisResult> {
    console.log('Performing aggregated analysis using summary tables');

    this.reportProgress({
      phase: 'fetching',
      progress: 10,
      processedRecords: 0,
      elapsedMs: Date.now() - startTime
    });

    // Get aggregated data
    const aggregatedData = await this.dataStore.queryAggregated(filters);

    this.reportProgress({
      phase: 'processing_sessions',
      progress: 40,
      processedRecords: aggregatedData.length,
      elapsedMs: Date.now() - startTime
    });

    // Convert aggregated data to approximate sessions and patterns
    const approximateAnalysis = this.convertAggregatedToAnalysis(aggregatedData);

    this.reportProgress({
      phase: 'generating_summary',
      progress: 80,
      processedRecords: aggregatedData.length,
      elapsedMs: Date.now() - startTime
    });

    const summary = this.generateAggregatedSummary(approximateAnalysis, aggregatedData);

    return {
      sessions: [], // Empty for aggregated analysis
      analysis: approximateAnalysis,
      summary,
      processingTime: Date.now() - startTime,
      timestamp: new Date(),
      appliedFilters: options || {}
    };
  }

  /**
   * Streaming analysis with sampling for very large datasets
   */
  private async performStreamingAnalysis(
    filters?: FilterCriteria, 
    options?: WorkflowAnalysisOptions,
    startTime: number = Date.now()
  ): Promise<WorkflowAnalysisResult> {
    console.log('Performing streaming analysis with sampling');

    let totalProcessed = 0;
    let sampledEntries: any[] = [];
    const sessions: Session[] = [];
    
    // Use sampling for very large datasets
    const shouldSample = this.config.useSampling;
    const samplingRate = this.config.samplingRate;

    this.reportProgress({
      phase: 'fetching',
      progress: 5,
      processedRecords: 0,
      elapsedMs: Date.now() - startTime
    });

    // Stream process data in batches
    await this.dataStore.queryStream(
      async (batch) => {
        totalProcessed += batch.length;
        
        // Apply sampling if enabled
        let processedBatch = batch;
        if (shouldSample) {
          processedBatch = batch.filter(() => Math.random() < samplingRate);
        }

        // Apply workflow filters
        if (options) {
          processedBatch = this.applyWorkflowFilters(processedBatch, options);
        }

        sampledEntries.push(...processedBatch);

        // Report progress
        this.reportProgress({
          phase: 'fetching',
          progress: Math.min(50, (totalProcessed / 100000) * 25), // Rough estimate
          processedRecords: totalProcessed,
          elapsedMs: Date.now() - startTime
        });

        // Check for timeout
        if (Date.now() - startTime > this.config.maxProcessingTimeMs) {
          console.warn('Analysis timeout reached, using partial data');
          throw new Error('Analysis timeout');
        }
      },
      filters,
      this.config.streamingBatchSize
    );

    this.reportProgress({
      phase: 'processing_sessions',
      progress: 60,
      processedRecords: sampledEntries.length,
      elapsedMs: Date.now() - startTime
    });

    // Process sampled entries in chunks to avoid memory issues
    const chunkSize = 10000;
    for (let i = 0; i < sampledEntries.length; i += chunkSize) {
      const chunk = sampledEntries.slice(i, i + chunkSize);
      const chunkSessions = this.sessionReconstruction.reconstructSessions(chunk);
      sessions.push(...chunkSessions);

      this.reportProgress({
        phase: 'processing_sessions',
        progress: 60 + ((i / sampledEntries.length) * 20),
        processedRecords: i + chunk.length,
        elapsedMs: Date.now() - startTime
      });
    }

    this.reportProgress({
      phase: 'analyzing_patterns',
      progress: 85,
      processedRecords: sessions.length,
      elapsedMs: Date.now() - startTime
    });

    // Discover patterns
    const analysis = this.patternDiscovery.discoverPatterns(sessions);

    this.reportProgress({
      phase: 'generating_summary',
      progress: 95,
      processedRecords: sessions.length,
      elapsedMs: Date.now() - startTime
    });

    // Generate summary with sampling information
    const summary = this.generateOptimizedSummary(sessions, analysis, {
      sampled: shouldSample,
      samplingRate: samplingRate,
      totalRecords: totalProcessed,
      processedRecords: sampledEntries.length
    });

    return {
      sessions: sessions.slice(0, 1000), // Return only first 1000 sessions to save memory
      analysis,
      summary,
      processingTime: Date.now() - startTime,
      timestamp: new Date(),
      appliedFilters: options || {}
    };
  }

  /**
   * Check if aggregation tables have relevant data
   */
  private async hasAggregationData(filters?: FilterCriteria): Promise<boolean> {
    try {
      const aggregated = await this.dataStore.queryAggregated(filters);
      return aggregated && aggregated.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert aggregated data to workflow analysis format
   */
  private convertAggregatedToAnalysis(aggregatedData: any[]): WorkflowAnalysis {
    // This is a simplified conversion - in practice you'd want more sophisticated logic
    const patterns: WorkflowPattern[] = [];
    const transitionMatrix = new Map<string, Map<string, number>>();
    const entryPoints = new Map<string, number>();
    const exitPoints = new Map<string, number>();

    // Generate approximate patterns from aggregated data
    for (const data of aggregatedData.slice(0, 10)) { // Top 10 patterns
      patterns.push({
        id: `pattern_${patterns.length}`,
        sequence: [`entry_${data.domain_name}`, `exit_${data.domain_name}`],
        frequency: data.total_requests || 0,
        averageDuration: data.avg_request_time || 0,
        successRate: data.total_errors ? 1 - (data.total_errors / data.total_requests) : 1,
        commonTransitions: [],
        endpoints: [data.domain_name],
        userSegments: ['aggregated'],
        timeDistribution: { hourly: [], daily: [], weekly: [] },
        conversionMetrics: { conversionRate: 0.8, dropOffRate: 0.2, averageSteps: 2 }
      });

      entryPoints.set(`entry_${data.domain_name}`, data.total_requests);
      exitPoints.set(`exit_${data.domain_name}`, data.total_requests);
    }

    return {
      patterns,
      transitionMatrix,
      entryPoints,
      exitPoints,
      dropOffPoints: [],
      commonSequences: []
    };
  }

  /**
   * Generate summary from aggregated data
   */
  private generateAggregatedSummary(analysis: WorkflowAnalysis, aggregatedData: any[]): WorkflowSummary {
    const totalRequests = aggregatedData.reduce((sum, data) => sum + (data.total_requests || 0), 0);
    const totalErrors = aggregatedData.reduce((sum, data) => sum + (data.total_errors || 0), 0);
    const avgRequestTime = aggregatedData.reduce((sum, data) => sum + (data.avg_request_time || 0), 0) / aggregatedData.length;

    const insights: WorkflowInsight[] = [
      {
        type: 'common_pattern',
        title: 'Analysis Based on Aggregated Data',
        description: `Analyzed ${totalRequests.toLocaleString()} requests across ${aggregatedData.length} time periods. Average error rate: ${((totalErrors / totalRequests) * 100).toFixed(1)}%`,
        severity: 'low',
        data: { totalRequests, totalErrors, avgRequestTime },
        actionable: false
      }
    ];

    const sortedEntryPoints = Array.from(analysis.entryPoints.entries()).sort((a, b) => b[1] - a[1]);
    const sortedExitPoints = Array.from(analysis.exitPoints.entries()).sort((a, b) => b[1] - a[1]);

    return {
      totalSessions: totalRequests, // Approximation
      averageSessionDuration: avgRequestTime * 1000, // Convert to ms
      mostCommonEntryPoint: sortedEntryPoints[0]?.[0] || 'N/A',
      mostCommonExitPoint: sortedExitPoints[0]?.[0] || 'N/A',
      conversionFunnels: [],
      insights
    };
  }

  /**
   * Generate optimized summary with additional metadata
   */
  private generateOptimizedSummary(
    sessions: Session[], 
    analysis: WorkflowAnalysis, 
    metadata?: any
  ): WorkflowSummary {
    // Start with regular summary generation
    const insights: WorkflowInsight[] = [];

    // Add sampling metadata if applicable
    if (metadata?.sampled) {
      insights.push({
        type: 'common_pattern',
        title: 'Sampled Analysis',
        description: `Analysis based on ${(metadata.samplingRate * 100).toFixed(1)}% sample (${metadata.processedRecords.toLocaleString()} of ${metadata.totalRecords.toLocaleString()} records)`,
        severity: 'low',
        data: metadata,
        actionable: false
      });
    }

    // Add standard insights
    insights.push(...this.generateStandardInsights(sessions, analysis));

    const sortedEntryPoints = Array.from(analysis.entryPoints.entries()).sort((a, b) => b[1] - a[1]);
    const sortedExitPoints = Array.from(analysis.exitPoints.entries()).sort((a, b) => b[1] - a[1]);

    const averageSessionDuration = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length 
      : 0;

    return {
      totalSessions: sessions.length,
      averageSessionDuration,
      mostCommonEntryPoint: sortedEntryPoints[0]?.[0] || 'N/A',
      mostCommonExitPoint: sortedExitPoints[0]?.[0] || 'N/A',
      conversionFunnels: this.generateConversionFunnels(analysis),
      insights
    };
  }

  /**
   * Generate standard workflow insights
   */
  private generateStandardInsights(sessions: Session[], analysis: WorkflowAnalysis): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Most common pattern insight
    if (analysis.patterns.length > 0) {
      const topPattern = analysis.patterns[0];
      insights.push({
        type: 'common_pattern',
        title: 'Most Common Workflow Pattern',
        description: `${topPattern.frequency} users followed: ${topPattern.sequence.join(' → ')}`,
        severity: 'low',
        data: topPattern,
        actionable: false
      });
    }

    // Performance insights
    if (sessions.length > 1000) {
      insights.push({
        type: 'common_pattern',
        title: 'High-Volume Analysis',
        description: `Analyzed ${sessions.length.toLocaleString()} user sessions for workflow patterns`,
        severity: 'low',
        data: { sessionCount: sessions.length },
        actionable: false
      });
    }

    return insights;
  }

  /**
   * Generate conversion funnels from patterns
   */
  private generateConversionFunnels(analysis: WorkflowAnalysis): Array<{
    name: string;
    steps: string[];
    conversionRate: number;
  }> {
    return analysis.patterns.slice(0, 3).map(pattern => ({
      name: `${pattern.sequence[0]} to ${pattern.sequence[pattern.sequence.length - 1]}`,
      steps: pattern.sequence,
      conversionRate: pattern.successRate
    }));
  }

  /**
   * Apply workflow-specific filters (same as original)
   */
  private applyWorkflowFilters(entries: any[], options: WorkflowAnalysisOptions): any[] {
    let filtered = [...entries];

    if (options.excludeEndpoints?.length) {
      filtered = filtered.filter(entry => {
        const normalizedUrl = this.normalizeEndpoint(entry.requestUrl);
        return !options.excludeEndpoints!.some(excluded => 
          normalizedUrl.includes(excluded) || entry.requestUrl.includes(excluded)
        );
      });
    }

    if (options.includeOnlyEndpoints?.length) {
      filtered = filtered.filter(entry => {
        const normalizedUrl = this.normalizeEndpoint(entry.requestUrl);
        return options.includeOnlyEndpoints!.some(included => 
          normalizedUrl.includes(included) || entry.requestUrl.includes(included)
        );
      });
    }

    if (options.excludeUserAgents?.length) {
      filtered = filtered.filter(entry => {
        return !options.excludeUserAgents!.some(excluded => 
          entry.userAgent.toLowerCase().includes(excluded.toLowerCase())
        );
      });
    }

    return filtered;
  }

  /**
   * Normalize endpoint URL (same as original)
   */
  private normalizeEndpoint(url: string): string {
    const baseUrl = url.split('?')[0];
    return baseUrl
      .replace(/\/\d+/g, '/{id}')
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/{uuid}')
      .replace(/\/[a-z0-9]{24}/gi, '/{objectId}')
      .replace(/\/[a-z0-9-_]+\.(jpg|jpeg|png|gif|svg|webp|pdf|doc|docx|xls|xlsx)/gi, '/{file}')
      .replace(/\/[a-z0-9]{32}/gi, '/{hash}')
      .replace(/\/[a-z0-9]{40}/gi, '/{sha1}')
      .replace(/\/[a-z0-9]{64}/gi, '/{sha256}');
  }

  /**
   * Report progress to callback if set
   */
  private reportProgress(progress: StreamingAnalysisProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Generate cache key for results
   */
  private generateCacheKey(filters?: FilterCriteria, options?: WorkflowAnalysisOptions): string {
    return JSON.stringify({ filters, options });
  }

  /**
   * Get cached result if still valid
   */
  private getCachedResult(cacheKey: string): WorkflowAnalysisResult | null {
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpiryMs) {
      return cached.result;
    }
    this.analysisCache.delete(cacheKey);
    return null;
  }

  /**
   * Set cached result
   */
  private setCachedResult(cacheKey: string, result: WorkflowAnalysisResult): void {
    this.analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.analysisCache.size > 10) {
      const entries = Array.from(this.analysisCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, -10).forEach(([key]) => this.analysisCache.delete(key));
    }
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OptimizedAnalysisConfig>): void {
    this.config = { ...this.config, ...config };
  }
}