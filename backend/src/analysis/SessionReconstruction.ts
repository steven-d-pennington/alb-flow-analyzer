/**
 * Session Reconstruction Engine
 * Identifies and groups requests into user sessions based on IP, time windows, and session identifiers
 */

import { ParsedLogEntry } from '../database/DataStore';

export interface SessionRequest {
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  userAgent: string;
  receivedBytes: number;
  sentBytes: number;
}

export interface Session {
  sessionId: string;
  clientIp: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in milliseconds
  requests: SessionRequest[];
  userAgent: string;
  totalRequests: number;
  errorCount: number;
  totalDataTransferred: number;
  extractedSessionToken?: string; // If found in URLs or headers
}

export interface SessionConfig {
  maxInactivityMinutes: number; // Max minutes between requests to consider same session
  sessionIdentifierPatterns: RegExp[]; // Patterns to extract session IDs from URLs
  minRequestsPerSession: number; // Minimum requests to consider a valid session
}

export class SessionReconstruction {
  private readonly defaultConfig: SessionConfig = {
    maxInactivityMinutes: 30,
    sessionIdentifierPatterns: [
      /[?&]jsessionid=([^&]+)/i,
      /[?&]sessionid=([^&]+)/i,
      /[?&]sid=([^&]+)/i,
      /[?&]session=([^&]+)/i,
      /;jsessionid=([^;?]+)/i,
      /\/sessions?\/([a-z0-9-]+)/i,
    ],
    minRequestsPerSession: 1
  };

  private config: SessionConfig;

  constructor(config?: Partial<SessionConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Reconstruct sessions from log entries
   */
  reconstructSessions(entries: ParsedLogEntry[]): Session[] {
    if (entries.length === 0) return [];

    // Sort entries by timestamp
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Group by client IP first
    const entriesByIp = this.groupByClientIp(sortedEntries);

    // Reconstruct sessions for each IP
    const allSessions: Session[] = [];
    
    for (const [clientIp, ipEntries] of entriesByIp.entries()) {
      const sessions = this.reconstructSessionsForIp(clientIp, ipEntries);
      allSessions.push(...sessions);
    }

    // Filter out sessions with too few requests
    return allSessions.filter(s => s.requests.length >= this.config.minRequestsPerSession);
  }

  /**
   * Group entries by client IP
   */
  private groupByClientIp(entries: ParsedLogEntry[]): Map<string, ParsedLogEntry[]> {
    const grouped = new Map<string, ParsedLogEntry[]>();
    
    for (const entry of entries) {
      const existing = grouped.get(entry.clientIp) || [];
      existing.push(entry);
      grouped.set(entry.clientIp, existing);
    }
    
    return grouped;
  }

  /**
   * Reconstruct sessions for a specific IP
   */
  private reconstructSessionsForIp(clientIp: string, entries: ParsedLogEntry[]): Session[] {
    const sessions: Session[] = [];
    let currentSession: Session | null = null;
    
    for (const entry of entries) {
      const entryTime = new Date(entry.timestamp);
      
      // Check if this entry belongs to current session
      if (currentSession) {
        const timeSinceLastRequest = entryTime.getTime() - currentSession.endTime.getTime();
        const maxInactivityMs = this.config.maxInactivityMinutes * 60 * 1000;
        
        // Check if same session (within time window and potentially same session ID)
        const isSameSession = timeSinceLastRequest <= maxInactivityMs &&
          this.isSameSessionToken(currentSession, entry);
        
        if (isSameSession) {
          // Add to current session
          this.addRequestToSession(currentSession, entry);
        } else {
          // Start new session
          sessions.push(currentSession);
          currentSession = this.createNewSession(clientIp, entry);
        }
      } else {
        // Start first session
        currentSession = this.createNewSession(clientIp, entry);
      }
    }
    
    // Add last session
    if (currentSession) {
      sessions.push(currentSession);
    }
    
    return sessions;
  }

  /**
   * Check if entry belongs to same session based on session tokens
   */
  private isSameSessionToken(session: Session, entry: ParsedLogEntry): boolean {
    // If we have an extracted session token, check if it matches
    if (session.extractedSessionToken) {
      const entryToken = this.extractSessionToken(entry.requestUrl);
      return entryToken === session.extractedSessionToken;
    }
    
    // Otherwise, just use time-based grouping
    return true;
  }

  /**
   * Extract session token from URL if present
   */
  private extractSessionToken(url: string): string | null {
    for (const pattern of this.config.sessionIdentifierPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Create a new session from an entry
   */
  private createNewSession(clientIp: string, entry: ParsedLogEntry): Session {
    const timestamp = new Date(entry.timestamp);
    const sessionToken = this.extractSessionToken(entry.requestUrl);
    const responseTime = (entry.requestProcessingTime + entry.targetProcessingTime + entry.responseProcessingTime) * 1000;
    
    return {
      sessionId: this.generateSessionId(clientIp, timestamp, sessionToken),
      clientIp,
      startTime: timestamp,
      endTime: timestamp,
      duration: 0,
      requests: [{
        timestamp,
        endpoint: this.normalizeEndpoint(entry.requestUrl),
        method: entry.requestVerb,
        statusCode: entry.elbStatusCode,
        responseTime,
        userAgent: entry.userAgent,
        receivedBytes: entry.receivedBytes,
        sentBytes: entry.sentBytes
      }],
      userAgent: entry.userAgent,
      totalRequests: 1,
      errorCount: entry.elbStatusCode >= 400 ? 1 : 0,
      totalDataTransferred: entry.receivedBytes + entry.sentBytes,
      extractedSessionToken: sessionToken || undefined
    };
  }

  /**
   * Add request to existing session
   */
  private addRequestToSession(session: Session, entry: ParsedLogEntry): void {
    const timestamp = new Date(entry.timestamp);
    const responseTime = (entry.requestProcessingTime + entry.targetProcessingTime + entry.responseProcessingTime) * 1000;
    
    session.requests.push({
      timestamp,
      endpoint: this.normalizeEndpoint(entry.requestUrl),
      method: entry.requestVerb,
      statusCode: entry.elbStatusCode,
      responseTime,
      userAgent: entry.userAgent,
      receivedBytes: entry.receivedBytes,
      sentBytes: entry.sentBytes
    });
    
    session.endTime = timestamp;
    session.duration = session.endTime.getTime() - session.startTime.getTime();
    session.totalRequests++;
    if (entry.elbStatusCode >= 400) {
      session.errorCount++;
    }
    session.totalDataTransferred += entry.receivedBytes + entry.sentBytes;
  }

  /**
   * Normalize endpoint URLs for pattern matching
   * Converts /users/123 to /users/{id}, /products/abc-123 to /products/{id}, etc.
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
   * Generate unique session ID
   */
  private generateSessionId(clientIp: string, timestamp: Date, sessionToken: string | null): string {
    const base = `${clientIp}-${timestamp.getTime()}`;
    if (sessionToken) {
      return `${base}-${sessionToken}`;
    }
    return `${base}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get session statistics
   */
  getSessionStatistics(sessions: Session[]): {
    totalSessions: number;
    averageSessionDuration: number;
    averageRequestsPerSession: number;
    sessionsWithErrors: number;
    uniqueIps: number;
    sessionsByUserAgent: Map<string, number>;
  } {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        averageSessionDuration: 0,
        averageRequestsPerSession: 0,
        sessionsWithErrors: 0,
        uniqueIps: 0,
        sessionsByUserAgent: new Map()
      };
    }

    const uniqueIps = new Set(sessions.map(s => s.clientIp));
    const userAgentCounts = new Map<string, number>();
    
    let totalDuration = 0;
    let totalRequests = 0;
    let sessionsWithErrors = 0;
    
    for (const session of sessions) {
      totalDuration += session.duration;
      totalRequests += session.totalRequests;
      if (session.errorCount > 0) {
        sessionsWithErrors++;
      }
      
      const uaCategory = this.categorizeUserAgent(session.userAgent);
      userAgentCounts.set(uaCategory, (userAgentCounts.get(uaCategory) || 0) + 1);
    }
    
    return {
      totalSessions: sessions.length,
      averageSessionDuration: totalDuration / sessions.length,
      averageRequestsPerSession: totalRequests / sessions.length,
      sessionsWithErrors,
      uniqueIps: uniqueIps.size,
      sessionsByUserAgent: userAgentCounts
    };
  }

  /**
   * Simple user agent categorization
   */
  private categorizeUserAgent(userAgent: string): string {
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return 'Mobile';
    }
    if (userAgent.includes('bot') || userAgent.includes('Bot') || userAgent.includes('crawler')) {
      return 'Bot';
    }
    if (userAgent.includes('Chrome') || userAgent.includes('Firefox') || userAgent.includes('Safari')) {
      return 'Desktop Browser';
    }
    if (userAgent.includes('curl') || userAgent.includes('wget')) {
      return 'CLI Tool';
    }
    return 'Other';
  }
}