/**
 * Pattern Discovery Engine
 * Discovers common workflow patterns and sequences from user sessions
 */

import { Session, SessionRequest } from './SessionReconstruction';

export interface WorkflowPattern {
  id: string;
  sequence: string[];
  frequency: number;
  averageDuration: number;
  successRate: number;
  averageRequestCount: number;
  userSegments: Map<string, number>;
  examples: string[]; // Sample session IDs that match this pattern
}

export interface TransitionProbability {
  from: string;
  to: string;
  probability: number;
  count: number;
  averageTime: number; // Average time between transitions in ms
}

export interface DropOffPoint {
  endpoint: string;
  dropOffRate: number;
  averageTimeSpent: number;
  totalOccurrences: number;
  continuePatterns: Map<string, number>; // Where users go if they continue
}

export interface WorkflowAnalysis {
  patterns: WorkflowPattern[];
  transitionMatrix: Map<string, Map<string, TransitionProbability>>;
  entryPoints: Map<string, number>;
  exitPoints: Map<string, number>;
  dropOffPoints: DropOffPoint[];
  commonSequences: Array<{
    sequence: string[];
    count: number;
    percentage: number;
  }>;
}

export class PatternDiscovery {
  private minPatternSupport: number; // Minimum frequency for a pattern to be considered significant
  private maxPatternLength: number; // Maximum sequence length to analyze
  
  constructor(minPatternSupport: number = 0.01, maxPatternLength: number = 10) {
    this.minPatternSupport = minPatternSupport;
    this.maxPatternLength = maxPatternLength;
  }

  /**
   * Discover workflow patterns from sessions
   */
  discoverPatterns(sessions: Session[]): WorkflowAnalysis {
    if (sessions.length === 0) {
      return {
        patterns: [],
        transitionMatrix: new Map(),
        entryPoints: new Map(),
        exitPoints: new Map(),
        dropOffPoints: [],
        commonSequences: []
      };
    }

    // Extract sequences from sessions
    const sequences = this.extractSequences(sessions);
    
    // Find frequent patterns using PrefixSpan algorithm
    const patterns = this.findFrequentPatterns(sequences, sessions);
    
    // Build transition probability matrix
    const transitionMatrix = this.buildTransitionMatrix(sessions);
    
    // Identify entry and exit points
    const { entryPoints, exitPoints } = this.identifyEntryExitPoints(sessions);
    
    // Find drop-off points
    const dropOffPoints = this.findDropOffPoints(sessions, transitionMatrix);
    
    // Get most common sequences
    const commonSequences = this.findCommonSequences(sequences);
    
    return {
      patterns,
      transitionMatrix,
      entryPoints,
      exitPoints,
      dropOffPoints,
      commonSequences
    };
  }

  /**
   * Extract endpoint sequences from sessions
   */
  private extractSequences(sessions: Session[]): Map<string, string[]> {
    const sequences = new Map<string, string[]>();
    
    for (const session of sessions) {
      const sequence = session.requests.map(r => r.endpoint);
      sequences.set(session.sessionId, sequence);
    }
    
    return sequences;
  }

  /**
   * Find frequent patterns using a simplified PrefixSpan approach
   */
  private findFrequentPatterns(
    sequences: Map<string, string[]>,
    sessions: Session[]
  ): WorkflowPattern[] {
    const patterns: WorkflowPattern[] = [];
    const minSupport = Math.floor(sequences.size * this.minPatternSupport);
    
    // Count all subsequences
    const subsequenceCounts = new Map<string, Set<string>>();
    
    for (const [sessionId, sequence] of sequences.entries()) {
      const foundSubsequences = new Set<string>();
      
      // Generate all possible subsequences
      for (let length = 2; length <= Math.min(sequence.length, this.maxPatternLength); length++) {
        for (let start = 0; start <= sequence.length - length; start++) {
          const subsequence = sequence.slice(start, start + length);
          const key = subsequence.join(' → ');
          
          if (!foundSubsequences.has(key)) {
            foundSubsequences.add(key);
            if (!subsequenceCounts.has(key)) {
              subsequenceCounts.set(key, new Set());
            }
            subsequenceCounts.get(key)!.add(sessionId);
          }
        }
      }
    }
    
    // Filter patterns by minimum support and create WorkflowPattern objects
    for (const [sequenceStr, sessionIds] of subsequenceCounts.entries()) {
      if (sessionIds.size >= minSupport) {
        const sequence = sequenceStr.split(' → ');
        const matchingSessions = Array.from(sessionIds).map(id => 
          sessions.find(s => s.sessionId === id)!
        );
        
        const pattern: WorkflowPattern = {
          id: this.generatePatternId(sequence),
          sequence,
          frequency: sessionIds.size,
          averageDuration: this.calculateAverageDuration(matchingSessions, sequence),
          successRate: this.calculateSuccessRate(matchingSessions),
          averageRequestCount: this.calculateAverageRequests(matchingSessions),
          userSegments: this.analyzeUserSegments(matchingSessions),
          examples: Array.from(sessionIds).slice(0, 5) // Keep first 5 examples
        };
        
        patterns.push(pattern);
      }
    }
    
    // Sort patterns by frequency
    patterns.sort((a, b) => b.frequency - a.frequency);
    
    return patterns;
  }

  /**
   * Build transition probability matrix
   */
  private buildTransitionMatrix(sessions: Session[]): Map<string, Map<string, TransitionProbability>> {
    const matrix = new Map<string, Map<string, TransitionProbability>>();
    const transitionCounts = new Map<string, Map<string, { count: number; totalTime: number }>>();
    
    // Count transitions
    for (const session of sessions) {
      for (let i = 0; i < session.requests.length - 1; i++) {
        const from = session.requests[i].endpoint;
        const to = session.requests[i + 1].endpoint;
        const timeDiff = new Date(session.requests[i + 1].timestamp).getTime() - 
                        new Date(session.requests[i].timestamp).getTime();
        
        if (!transitionCounts.has(from)) {
          transitionCounts.set(from, new Map());
        }
        
        const fromTransitions = transitionCounts.get(from)!;
        if (!fromTransitions.has(to)) {
          fromTransitions.set(to, { count: 0, totalTime: 0 });
        }
        
        const transition = fromTransitions.get(to)!;
        transition.count++;
        transition.totalTime += timeDiff;
      }
    }
    
    // Calculate probabilities
    for (const [from, transitions] of transitionCounts.entries()) {
      const totalFromCount = Array.from(transitions.values())
        .reduce((sum, t) => sum + t.count, 0);
      
      const fromProbabilities = new Map<string, TransitionProbability>();
      
      for (const [to, stats] of transitions.entries()) {
        fromProbabilities.set(to, {
          from,
          to,
          probability: stats.count / totalFromCount,
          count: stats.count,
          averageTime: stats.totalTime / stats.count
        });
      }
      
      matrix.set(from, fromProbabilities);
    }
    
    return matrix;
  }

  /**
   * Identify entry and exit points
   */
  private identifyEntryExitPoints(sessions: Session[]): {
    entryPoints: Map<string, number>;
    exitPoints: Map<string, number>;
  } {
    const entryPoints = new Map<string, number>();
    const exitPoints = new Map<string, number>();
    
    for (const session of sessions) {
      if (session.requests.length > 0) {
        // Entry point
        const firstEndpoint = session.requests[0].endpoint;
        entryPoints.set(firstEndpoint, (entryPoints.get(firstEndpoint) || 0) + 1);
        
        // Exit point
        const lastEndpoint = session.requests[session.requests.length - 1].endpoint;
        exitPoints.set(lastEndpoint, (exitPoints.get(lastEndpoint) || 0) + 1);
      }
    }
    
    return { entryPoints, exitPoints };
  }

  /**
   * Find drop-off points where users commonly leave
   */
  private findDropOffPoints(
    sessions: Session[],
    transitionMatrix: Map<string, Map<string, TransitionProbability>>
  ): DropOffPoint[] {
    const dropOffPoints: DropOffPoint[] = [];
    const endpointStats = new Map<string, {
      occurrences: number;
      exits: number;
      totalTime: number;
      continues: Map<string, number>;
    }>();
    
    // Analyze each session
    for (const session of sessions) {
      for (let i = 0; i < session.requests.length; i++) {
        const endpoint = session.requests[i].endpoint;
        
        if (!endpointStats.has(endpoint)) {
          endpointStats.set(endpoint, {
            occurrences: 0,
            exits: 0,
            totalTime: 0,
            continues: new Map()
          });
        }
        
        const stats = endpointStats.get(endpoint)!;
        stats.occurrences++;
        
        // Calculate time spent on this endpoint
        if (i < session.requests.length - 1) {
          const timeSpent = new Date(session.requests[i + 1].timestamp).getTime() - 
                           new Date(session.requests[i].timestamp).getTime();
          stats.totalTime += timeSpent;
          
          // Track where they continue to
          const nextEndpoint = session.requests[i + 1].endpoint;
          stats.continues.set(nextEndpoint, (stats.continues.get(nextEndpoint) || 0) + 1);
        } else {
          // This was an exit point
          stats.exits++;
          // For last request, estimate time spent as average response time
          stats.totalTime += session.requests[i].responseTime;
        }
      }
    }
    
    // Calculate drop-off rates
    for (const [endpoint, stats] of endpointStats.entries()) {
      const dropOffRate = stats.exits / stats.occurrences;
      
      // Only consider significant drop-off points
      if (dropOffRate > 0.1 && stats.occurrences > 10) {
        dropOffPoints.push({
          endpoint,
          dropOffRate,
          averageTimeSpent: stats.totalTime / stats.occurrences,
          totalOccurrences: stats.occurrences,
          continuePatterns: stats.continues
        });
      }
    }
    
    // Sort by drop-off rate
    dropOffPoints.sort((a, b) => b.dropOffRate - a.dropOffRate);
    
    return dropOffPoints;
  }

  /**
   * Find most common sequences
   */
  private findCommonSequences(sequences: Map<string, string[]>): Array<{
    sequence: string[];
    count: number;
    percentage: number;
  }> {
    const sequenceCounts = new Map<string, number>();
    
    for (const sequence of sequences.values()) {
      const key = sequence.join(' → ');
      sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
    }
    
    const totalSessions = sequences.size;
    const commonSequences = Array.from(sequenceCounts.entries())
      .map(([sequenceStr, count]) => ({
        sequence: sequenceStr.split(' → '),
        count,
        percentage: (count / totalSessions) * 100
      }))
      .filter(s => s.count > 1) // At least 2 occurrences
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20
    
    return commonSequences;
  }

  /**
   * Helper methods
   */
  private generatePatternId(sequence: string[]): string {
    return sequence.join('-').replace(/[^a-z0-9-]/gi, '').substring(0, 50);
  }

  private calculateAverageDuration(sessions: Session[], sequence: string[]): number {
    let totalDuration = 0;
    let count = 0;
    
    for (const session of sessions) {
      // Find where this sequence occurs in the session
      const indices = this.findSequenceIndices(session.requests.map(r => r.endpoint), sequence);
      
      for (const startIdx of indices) {
        if (startIdx + sequence.length <= session.requests.length) {
          const startTime = new Date(session.requests[startIdx].timestamp).getTime();
          const endTime = new Date(session.requests[startIdx + sequence.length - 1].timestamp).getTime();
          totalDuration += endTime - startTime;
          count++;
        }
      }
    }
    
    return count > 0 ? totalDuration / count : 0;
  }

  private findSequenceIndices(arr: string[], sequence: string[]): number[] {
    const indices: number[] = [];
    
    for (let i = 0; i <= arr.length - sequence.length; i++) {
      let match = true;
      for (let j = 0; j < sequence.length; j++) {
        if (arr[i + j] !== sequence[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        indices.push(i);
      }
    }
    
    return indices;
  }

  private calculateSuccessRate(sessions: Session[]): number {
    const successfulSessions = sessions.filter(s => s.errorCount === 0);
    return sessions.length > 0 ? successfulSessions.length / sessions.length : 0;
  }

  private calculateAverageRequests(sessions: Session[]): number {
    const total = sessions.reduce((sum, s) => sum + s.totalRequests, 0);
    return sessions.length > 0 ? total / sessions.length : 0;
  }

  private analyzeUserSegments(sessions: Session[]): Map<string, number> {
    const segments = new Map<string, number>();
    
    for (const session of sessions) {
      const segment = this.categorizeUserAgent(session.userAgent);
      segments.set(segment, (segments.get(segment) || 0) + 1);
    }
    
    // Convert to percentages
    const total = sessions.length;
    for (const [segment, count] of segments.entries()) {
      segments.set(segment, (count / total) * 100);
    }
    
    return segments;
  }

  private categorizeUserAgent(userAgent: string): string {
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return 'Mobile';
    }
    if (userAgent.includes('bot') || userAgent.includes('Bot') || userAgent.includes('crawler')) {
      return 'Bot';
    }
    if (userAgent.includes('Chrome') || userAgent.includes('Firefox') || userAgent.includes('Safari')) {
      return 'Desktop';
    }
    return 'Other';
  }
}