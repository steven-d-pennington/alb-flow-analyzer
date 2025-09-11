/**
 * Workflow Analysis Service
 * Combines session reconstruction and pattern discovery to analyze user workflows
 */

import { SessionReconstruction, Session, SessionConfig } from './SessionReconstruction';
import { PatternDiscovery, WorkflowAnalysis, WorkflowPattern } from './PatternDiscovery';
import { DataStore, FilterCriteria } from '../database/DataStore';

export interface WorkflowInsight {
  type: 'high_drop_off' | 'common_pattern' | 'long_session' | 'error_prone_path';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  data: any;
  actionable: boolean;
}

export interface WorkflowSummary {
  totalSessions: number;
  averageSessionDuration: number;
  mostCommonEntryPoint: string;
  mostCommonExitPoint: string;
  conversionFunnels: Array<{
    name: string;
    steps: string[];
    conversionRate: number;
  }>;
  insights: WorkflowInsight[];
}

export interface WorkflowAnalysisOptions {
  excludeEndpoints?: string[]; // Endpoints to exclude (keepalives, health checks, etc.)
  includeOnlyEndpoints?: string[]; // Only include these endpoints
  minSessionDuration?: number; // Minimum session duration in milliseconds
  excludeUserAgents?: string[]; // User agent patterns to exclude (bots, monitoring)
}

export interface WorkflowAnalysisResult {
  sessions: Session[];
  analysis: WorkflowAnalysis;
  summary: WorkflowSummary;
  processingTime: number;
  timestamp: Date;
  appliedFilters: WorkflowAnalysisOptions;
}

export class WorkflowAnalysisService {
  private sessionReconstruction: SessionReconstruction;
  private patternDiscovery: PatternDiscovery;
  private dataStore: DataStore;

  constructor(
    dataStore: DataStore,
    sessionConfig?: Partial<SessionConfig>
  ) {
    this.dataStore = dataStore;
    this.sessionReconstruction = new SessionReconstruction(sessionConfig);
    this.patternDiscovery = new PatternDiscovery();
  }

  /**
   * Perform comprehensive workflow analysis
   */
  async analyzeWorkflows(filters?: FilterCriteria, options?: WorkflowAnalysisOptions): Promise<WorkflowAnalysisResult> {
    const startTime = Date.now();

    try {
      // Fetch log entries with optional filters
      let entries = await this.dataStore.query(filters);
      
      // Apply workflow-specific filtering
      if (options) {
        entries = this.applyWorkflowFilters(entries, options);
      }
      
      if (entries.length === 0) {
        return {
          sessions: [],
          analysis: {
            patterns: [],
            transitionMatrix: new Map(),
            entryPoints: new Map(),
            exitPoints: new Map(),
            dropOffPoints: [],
            commonSequences: []
          },
          summary: {
            totalSessions: 0,
            averageSessionDuration: 0,
            mostCommonEntryPoint: 'N/A',
            mostCommonExitPoint: 'N/A',
            conversionFunnels: [],
            insights: []
          },
          processingTime: Date.now() - startTime,
          timestamp: new Date(),
          appliedFilters: options || {}
        };
      }

      // Step 1: Reconstruct user sessions
      console.log(`Reconstructing sessions from ${entries.length} log entries...`);
      const sessions = this.sessionReconstruction.reconstructSessions(entries);
      console.log(`Identified ${sessions.length} user sessions`);

      // Step 2: Discover patterns and analyze workflows
      console.log('Analyzing workflow patterns...');
      const analysis = this.patternDiscovery.discoverPatterns(sessions);
      console.log(`Discovered ${analysis.patterns.length} workflow patterns`);

      // Step 3: Generate summary and insights
      const summary = this.generateSummary(sessions, analysis);

      return {
        sessions,
        analysis,
        summary,
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
        appliedFilters: options || {}
      };

    } catch (error) {
      console.error('Error during workflow analysis:', error);
      throw error;
    }
  }

  /**
   * Get detailed session information
   */
  async getSessionDetails(sessionId: string): Promise<Session | null> {
    // This would typically involve caching or re-running analysis
    // For now, we'll implement a simple approach
    const entries = await this.dataStore.query();
    const sessions = this.sessionReconstruction.reconstructSessions(entries);
    
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  /**
   * Get patterns similar to a given pattern
   */
  async getSimilarPatterns(patternId: string, filters?: FilterCriteria): Promise<WorkflowPattern[]> {
    const result = await this.analyzeWorkflows(filters);
    const targetPattern = result.analysis.patterns.find(p => p.id === patternId);
    
    if (!targetPattern) {
      return [];
    }

    // Find patterns with similar sequences or high overlap
    return result.analysis.patterns
      .filter(p => p.id !== patternId)
      .filter(p => this.calculateSequenceOverlap(targetPattern.sequence, p.sequence) > 0.5)
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate comprehensive summary and insights
   */
  private generateSummary(sessions: Session[], analysis: WorkflowAnalysis): WorkflowSummary {
    const insights: WorkflowInsight[] = [];

    // Find most common entry/exit points
    const sortedEntryPoints = Array.from(analysis.entryPoints.entries())
      .sort((a, b) => b[1] - a[1]);
    const sortedExitPoints = Array.from(analysis.exitPoints.entries())
      .sort((a, b) => b[1] - a[1]);

    const mostCommonEntryPoint = sortedEntryPoints[0]?.[0] || 'N/A';
    const mostCommonExitPoint = sortedExitPoints[0]?.[0] || 'N/A';

    // Calculate average session duration
    const averageSessionDuration = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length 
      : 0;

    // Generate insights
    insights.push(...this.generateDropOffInsights(analysis));
    insights.push(...this.generatePatternInsights(analysis));
    insights.push(...this.generateSessionInsights(sessions));

    // Generate conversion funnels for common patterns
    const conversionFunnels = this.generateConversionFunnels(analysis, sessions);

    return {
      totalSessions: sessions.length,
      averageSessionDuration,
      mostCommonEntryPoint,
      mostCommonExitPoint,
      conversionFunnels,
      insights
    };
  }

  /**
   * Generate insights about drop-off points
   */
  private generateDropOffInsights(analysis: WorkflowAnalysis): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // High drop-off rate insights
    const highDropOffPoints = analysis.dropOffPoints.filter(d => d.dropOffRate > 0.3);
    
    for (const dropOff of highDropOffPoints.slice(0, 3)) {
      insights.push({
        type: 'high_drop_off',
        title: `High Drop-off at ${dropOff.endpoint}`,
        description: `${(dropOff.dropOffRate * 100).toFixed(1)}% of users leave after visiting this endpoint. Average time spent: ${(dropOff.averageTimeSpent / 1000).toFixed(1)}s`,
        severity: dropOff.dropOffRate > 0.5 ? 'high' : 'medium',
        data: dropOff,
        actionable: true
      });
    }

    return insights;
  }

  /**
   * Generate insights about common patterns
   */
  private generatePatternInsights(analysis: WorkflowAnalysis): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Most common pattern insight
    if (analysis.patterns.length > 0) {
      const topPattern = analysis.patterns[0];
      insights.push({
        type: 'common_pattern',
        title: `Most Common Workflow Pattern`,
        description: `${topPattern.frequency} users followed the pattern: ${topPattern.sequence.join(' → ')}. Success rate: ${(topPattern.successRate * 100).toFixed(1)}%`,
        severity: 'low',
        data: topPattern,
        actionable: false
      });
    }

    // Error-prone patterns
    const errorPronePatterns = analysis.patterns.filter(p => p.successRate < 0.8);
    for (const pattern of errorPronePatterns.slice(0, 2)) {
      insights.push({
        type: 'error_prone_path',
        title: `Error-Prone Workflow`,
        description: `Pattern "${pattern.sequence.join(' → ')}" has only ${(pattern.successRate * 100).toFixed(1)}% success rate with ${pattern.frequency} occurrences`,
        severity: pattern.successRate < 0.5 ? 'high' : 'medium',
        data: pattern,
        actionable: true
      });
    }

    return insights;
  }

  /**
   * Generate insights about sessions
   */
  private generateSessionInsights(sessions: Session[]): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Long session detection
    const averageDuration = sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length;
    const longSessions = sessions.filter(s => s.duration > averageDuration * 3);

    if (longSessions.length > sessions.length * 0.05) { // More than 5% are long sessions
      insights.push({
        type: 'long_session',
        title: `Unusually Long Sessions Detected`,
        description: `${longSessions.length} sessions (${((longSessions.length / sessions.length) * 100).toFixed(1)}%) lasted significantly longer than average`,
        severity: 'medium',
        data: { count: longSessions.length, averageDuration: averageDuration },
        actionable: true
      });
    }

    return insights;
  }

  /**
   * Generate conversion funnels from common patterns
   */
  private generateConversionFunnels(analysis: WorkflowAnalysis, sessions: Session[]): Array<{
    name: string;
    steps: string[];
    conversionRate: number;
  }> {
    const funnels: Array<{
      name: string;
      steps: string[];
      conversionRate: number;
    }> = [];

    // Create funnels from top patterns
    for (const pattern of analysis.patterns.slice(0, 5)) {
      const conversionRate = pattern.successRate;
      
      funnels.push({
        name: `Pattern: ${pattern.sequence[0]} to ${pattern.sequence[pattern.sequence.length - 1]}`,
        steps: pattern.sequence,
        conversionRate
      });
    }

    return funnels;
  }

  /**
   * Apply workflow-specific filtering to log entries
   */
  private applyWorkflowFilters(entries: any[], options: WorkflowAnalysisOptions): any[] {
    let filtered = [...entries];

    // Filter out excluded endpoints
    if (options.excludeEndpoints && options.excludeEndpoints.length > 0) {
      filtered = filtered.filter(entry => {
        const normalizedUrl = this.normalizeEndpoint(entry.requestUrl);
        return !options.excludeEndpoints!.some(excluded => 
          normalizedUrl.includes(excluded) || entry.requestUrl.includes(excluded)
        );
      });
    }

    // Filter to only include specified endpoints
    if (options.includeOnlyEndpoints && options.includeOnlyEndpoints.length > 0) {
      filtered = filtered.filter(entry => {
        const normalizedUrl = this.normalizeEndpoint(entry.requestUrl);
        return options.includeOnlyEndpoints!.some(included => 
          normalizedUrl.includes(included) || entry.requestUrl.includes(included)
        );
      });
    }

    // Filter out excluded user agents
    if (options.excludeUserAgents && options.excludeUserAgents.length > 0) {
      filtered = filtered.filter(entry => {
        return !options.excludeUserAgents!.some(excluded => 
          entry.userAgent.toLowerCase().includes(excluded.toLowerCase())
        );
      });
    }

    return filtered;
  }

  /**
   * Normalize endpoint URL for filtering (same logic as SessionReconstruction)
   */
  private normalizeEndpoint(url: string): string {
    // Remove query parameters
    const baseUrl = url.split('?')[0];
    
    // Common ID patterns to normalize
    return baseUrl
      .replace(/\/\d+/g, '/{id}') // Numeric IDs
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/{uuid}') // UUIDs
      .replace(/\/[a-z0-9]{24}/gi, '/{objectId}') // MongoDB ObjectIds
      .replace(/\/[a-z0-9-_]+\.(jpg|jpeg|png|gif|svg|webp|pdf|doc|docx|xls|xlsx)/gi, '/{file}') // Files
      .replace(/\/[a-z0-9]{32}/gi, '/{hash}') // MD5 hashes
      .replace(/\/[a-z0-9]{40}/gi, '/{sha1}') // SHA1 hashes
      .replace(/\/[a-z0-9]{64}/gi, '/{sha256}'); // SHA256 hashes
  }

  /**
   * Calculate overlap between two sequences
   */
  private calculateSequenceOverlap(seq1: string[], seq2: string[]): number {
    const set1 = new Set(seq1);
    const set2 = new Set(seq2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Update session reconstruction configuration
   */
  updateSessionConfig(config: Partial<SessionConfig>): void {
    this.sessionReconstruction = new SessionReconstruction(config);
  }

  /**
   * Update pattern discovery configuration
   */
  updatePatternConfig(minSupport?: number, maxLength?: number): void {
    this.patternDiscovery = new PatternDiscovery(minSupport, maxLength);
  }
}