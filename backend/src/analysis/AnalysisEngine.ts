/**
 * Analysis Engine for computing traffic patterns and metrics from ALB flow logs
 */

import { DataStore, ParsedLogEntry, FilterCriteria } from '../database/DataStore';

// Analysis result types
export interface TrafficMetrics {
    totalRequests: number;
    requestsPerMinute: TimeSeries[];
    requestsPerHour: TimeSeries[];
    requestsPerDay: TimeSeries[];
    peakPeriods: PeakPeriod[];
    responseTimePercentiles: ResponseTimeStats;
    responseTimeBreakdown: ResponseTimeBreakdown;
    statusCodeDistribution: StatusCodeStats[];
    statusCodeTrends: StatusCodeTrends[];
    endpointStats: EndpointStats[];
    userAgentStats: UserAgentStats[];
    connectionStats: ConnectionStats[];
    errorPatterns: ErrorPattern[];
}

export interface TimeSeries {
    timestamp: string;
    value: number;
}

export interface PeakPeriod {
    startTime: string;
    endTime: string;
    requestCount: number;
    averageRpm: number;
}

export interface ResponseTimeStats {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    average: number;
    min: number;
    max: number;
}

export interface ResponseTimeBreakdown {
    requestProcessing: ResponseTimeStats;
    targetProcessing: ResponseTimeStats;
    responseProcessing: ResponseTimeStats;
    total: ResponseTimeStats;
}

export interface StatusCodeStats {
    statusCode: number;
    count: number;
    percentage: number;
}

export interface EndpointStats {
    endpoint: string;
    requestCount: number;
    percentage: number;
    averageResponseTime: number;
    errorRate: number;
}

export interface UserAgentStats {
    userAgent: string;
    category: string;
    count: number;
    percentage: number;
    averageResponseTime: number;
    errorRate: number;
}

export interface ConnectionStats {
    connectionId: string;
    count: number;
    percentage: number;
    averageResponseTime: number;
    errorRate: number;
    endpoints: string[];
}

export interface ErrorPattern {
    statusCode: number;
    endpoint: string;
    count: number;
    timeRange: { start: string; end: string };
    sampleErrors: string[];
}

export interface StatusCodeTrends {
    timestamp: string;
    successRate: number;  // 2xx
    clientErrorRate: number;  // 4xx
    serverErrorRate: number;  // 5xx
}

export interface AnalysisResult {
    metrics: TrafficMetrics;
    filteredEntryCount: number;
    totalEntryCount: number;
    processingTime: number;
    lastUpdated: string;
}

/**
 * Main Analysis Engine class
 */
export class AnalysisEngine {
    private dataStore: DataStore;

    constructor(dataStore: DataStore) {
        this.dataStore = dataStore;
    }

    /**
     * Get the underlying data store (for debugging)
     */
    getDataStore(): DataStore {
        return this.dataStore;
    }

    /**
     * Perform complete analysis on log entries
     */
    async analyzeTrafficPatterns(filters?: FilterCriteria): Promise<AnalysisResult> {
        const startTime = Date.now();

        // Get filtered and total counts
        const [filteredEntries, totalCount] = await Promise.all([
            this.dataStore.query(filters),
            this.dataStore.count()
        ]);

        const filteredCount = filteredEntries.length;

        // Calculate all metrics
        const metrics: TrafficMetrics = {
            totalRequests: filteredCount,
            requestsPerMinute: this.calculateRequestsPerMinute(filteredEntries),
            requestsPerHour: this.calculateRequestsPerHour(filteredEntries),
            requestsPerDay: this.calculateRequestsPerDay(filteredEntries),
            peakPeriods: this.identifyPeakPeriods(filteredEntries),
            responseTimePercentiles: this.calculateResponseTimePercentiles(filteredEntries),
            responseTimeBreakdown: this.calculateResponseTimeBreakdown(filteredEntries),
            statusCodeDistribution: this.calculateStatusCodeDistribution(filteredEntries),
            statusCodeTrends: this.calculateStatusCodeTrends(filteredEntries),
            endpointStats: this.calculateEndpointStats(filteredEntries),
            userAgentStats: this.calculateUserAgentStats(filteredEntries),
            connectionStats: this.calculateConnectionStats(filteredEntries),
            errorPatterns: this.identifyErrorPatterns(filteredEntries)
        };

        const processingTime = Date.now() - startTime;

        return {
            metrics,
            filteredEntryCount: filteredCount,
            totalEntryCount: totalCount,
            processingTime,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Calculate requests per minute time series
     */
    private calculateRequestsPerMinute(entries: ParsedLogEntry[]): TimeSeries[] {
        if (entries.length === 0) return [];

        // Group entries by minute
        const minuteGroups = new Map<string, number>();

        entries.forEach(entry => {
            const minute = new Date(entry.timestamp);
            minute.setSeconds(0, 0); // Round down to minute
            const key = minute.toISOString();
            minuteGroups.set(key, (minuteGroups.get(key) || 0) + 1);
        });

        // Convert to time series and sort
        return Array.from(minuteGroups.entries())
            .map(([timestamp, value]) => ({ timestamp, value }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    /**
     * Calculate requests per hour time series
     */
    private calculateRequestsPerHour(entries: ParsedLogEntry[]): TimeSeries[] {
        if (entries.length === 0) return [];

        // Group entries by hour
        const hourGroups = new Map<string, number>();

        entries.forEach(entry => {
            const hour = new Date(entry.timestamp);
            hour.setMinutes(0, 0, 0); // Round down to hour
            const key = hour.toISOString();
            hourGroups.set(key, (hourGroups.get(key) || 0) + 1);
        });

        // Convert to time series and sort
        return Array.from(hourGroups.entries())
            .map(([timestamp, value]) => ({ timestamp, value }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    /**
     * Calculate requests per day time series
     */
    private calculateRequestsPerDay(entries: ParsedLogEntry[]): TimeSeries[] {
        if (entries.length === 0) return [];

        // Group entries by day
        const dayGroups = new Map<string, number>();

        entries.forEach(entry => {
            const day = new Date(entry.timestamp);
            day.setHours(0, 0, 0, 0); // Round down to day
            const key = day.toISOString();
            dayGroups.set(key, (dayGroups.get(key) || 0) + 1);
        });

        // Convert to time series and sort
        return Array.from(dayGroups.entries())
            .map(([timestamp, value]) => ({ timestamp, value }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    /**
     * Identify peak traffic periods
     */
    private identifyPeakPeriods(entries: ParsedLogEntry[]): PeakPeriod[] {
        const requestsPerMinute = this.calculateRequestsPerMinute(entries);
        if (requestsPerMinute.length === 0) return [];

        // Calculate average and threshold for peak detection
        const averageRpm = requestsPerMinute.reduce((sum, point) => sum + point.value, 0) / requestsPerMinute.length;
        const threshold = averageRpm * 1.5; // 50% above average

        const peaks: PeakPeriod[] = [];

        interface PeakData {
            start: number;
            end: number;
            requests: number[];
        }

        let currentPeak: PeakData | null = null;

        requestsPerMinute.forEach((point, index) => {
            if (point.value >= threshold) {
                if (!currentPeak) {
                    // Start new peak
                    currentPeak = {
                        start: index,
                        end: index,
                        requests: [point.value]
                    };
                } else {
                    // Extend current peak
                    currentPeak.end = index;
                    currentPeak.requests.push(point.value);
                }
            } else if (currentPeak) {
                // End current peak
                const startTime = requestsPerMinute[currentPeak.start].timestamp;
                const endTime = requestsPerMinute[currentPeak.end].timestamp;
                const requestCount = currentPeak.requests.reduce((sum: number, req: number) => sum + req, 0);
                const averageRpm = requestCount / currentPeak.requests.length;

                peaks.push({
                    startTime,
                    endTime,
                    requestCount,
                    averageRpm
                });

                currentPeak = null;
            }
        });

        // Handle peak that extends to the end
        if (currentPeak) {
            const peak = currentPeak as PeakData;
            const startTime = requestsPerMinute[peak.start].timestamp;
            const endTime = requestsPerMinute[peak.end].timestamp;
            const requestCount = peak.requests.reduce((sum: number, req: number) => sum + req, 0);
            const averageRpm = requestCount / peak.requests.length;

            peaks.push({
                startTime,
                endTime,
                requestCount,
                averageRpm
            });
        }

        // Sort by request count (highest first) and return top 10
        return peaks
            .sort((a, b) => b.requestCount - a.requestCount)
            .slice(0, 10);
    }

    /**
     * Calculate response time percentiles
     */
    private calculateResponseTimePercentiles(entries: ParsedLogEntry[]): ResponseTimeStats {
        if (entries.length === 0) {
            return { p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 };
        }

        // Calculate total response time (request + target + response processing time)
        const responseTimes = entries.map(entry =>
            (entry.requestProcessingTime + entry.targetProcessingTime + entry.responseProcessingTime) * 1000 // Convert to ms
        ).sort((a, b) => a - b);

        const count = responseTimes.length;
        const sum = responseTimes.reduce((acc, time) => acc + time, 0);

        return {
            p50: this.percentile(responseTimes, 0.5),
            p90: this.percentile(responseTimes, 0.9),
            p95: this.percentile(responseTimes, 0.95),
            p99: this.percentile(responseTimes, 0.99),
            average: sum / count,
            min: responseTimes[0],
            max: responseTimes[count - 1]
        };
    }

    /**
     * Calculate status code distribution
     */
    private calculateStatusCodeDistribution(entries: ParsedLogEntry[]): StatusCodeStats[] {
        if (entries.length === 0) return [];

        const statusCounts = new Map<number, number>();

        entries.forEach(entry => {
            const code = entry.elbStatusCode;
            statusCounts.set(code, (statusCounts.get(code) || 0) + 1);
        });

        const total = entries.length;

        return Array.from(statusCounts.entries())
            .map(([statusCode, count]) => ({
                statusCode,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Calculate endpoint statistics
     */
    private calculateEndpointStats(entries: ParsedLogEntry[]): EndpointStats[] {
        if (entries.length === 0) return [];

        const endpointData = new Map<string, {
            count: number;
            responseTimes: number[];
            errors: number;
        }>();

        entries.forEach(entry => {
            const endpoint = entry.requestUrl;
            const responseTime = (entry.requestProcessingTime + entry.targetProcessingTime + entry.responseProcessingTime) * 1000;
            const isError = entry.elbStatusCode >= 400;

            if (!endpointData.has(endpoint)) {
                endpointData.set(endpoint, {
                    count: 0,
                    responseTimes: [],
                    errors: 0
                });
            }

            const data = endpointData.get(endpoint)!;
            data.count++;
            data.responseTimes.push(responseTime);
            if (isError) data.errors++;
        });

        const total = entries.length;

        return Array.from(endpointData.entries())
            .map(([endpoint, data]) => ({
                endpoint,
                requestCount: data.count,
                percentage: (data.count / total) * 100,
                averageResponseTime: data.responseTimes.reduce((sum, time) => sum + time, 0) / data.responseTimes.length,
                errorRate: (data.errors / data.count) * 100
            }))
            .sort((a, b) => b.requestCount - a.requestCount)
            .slice(0, 20); // Top 20 endpoints
    }

    /**
     * Calculate user agent statistics with enhanced metrics
     */
    private calculateUserAgentStats(entries: ParsedLogEntry[]): UserAgentStats[] {
        if (entries.length === 0) return [];

        const userAgentData = new Map<string, {
            count: number;
            originalUserAgent: string;
            responseTimes: number[];
            errors: number;
        }>();

        entries.forEach(entry => {
            const normalizedUserAgent = this.normalizeUserAgent(entry.userAgent);
            const responseTime = (entry.requestProcessingTime + entry.targetProcessingTime + entry.responseProcessingTime) * 1000;
            const isError = entry.elbStatusCode >= 400;

            const existing = userAgentData.get(normalizedUserAgent);

            if (existing) {
                existing.count++;
                existing.responseTimes.push(responseTime);
                if (isError) existing.errors++;
            } else {
                userAgentData.set(normalizedUserAgent, {
                    count: 1,
                    originalUserAgent: entry.userAgent,
                    responseTimes: [responseTime],
                    errors: isError ? 1 : 0
                });
            }
        });

        const total = entries.length;

        return Array.from(userAgentData.entries())
            .map(([userAgent, data]) => ({
                userAgent,
                category: this.categorizeUserAgent(data.originalUserAgent),
                count: data.count,
                percentage: (data.count / total) * 100,
                averageResponseTime: data.responseTimes.reduce((sum, time) => sum + time, 0) / data.responseTimes.length,
                errorRate: (data.errors / data.count) * 100
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15); // Top 15 user agents
    }

    /**
     * Calculate response time breakdown by component
     */
    private calculateResponseTimeBreakdown(entries: ParsedLogEntry[]): ResponseTimeBreakdown {
        if (entries.length === 0) {
            const emptyStats = { p50: 0, p90: 0, p95: 0, p99: 0, average: 0, min: 0, max: 0 };
            return {
                requestProcessing: emptyStats,
                targetProcessing: emptyStats,
                responseProcessing: emptyStats,
                total: emptyStats
            };
        }

        const requestTimes = entries.map(e => e.requestProcessingTime * 1000).sort((a, b) => a - b);
        const targetTimes = entries.map(e => e.targetProcessingTime * 1000).sort((a, b) => a - b);
        const responseTimes = entries.map(e => e.responseProcessingTime * 1000).sort((a, b) => a - b);
        const totalTimes = entries.map(e => 
            (e.requestProcessingTime + e.targetProcessingTime + e.responseProcessingTime) * 1000
        ).sort((a, b) => a - b);

        const calculateStats = (times: number[]): ResponseTimeStats => ({
            p50: this.percentile(times, 0.5),
            p90: this.percentile(times, 0.9),
            p95: this.percentile(times, 0.95),
            p99: this.percentile(times, 0.99),
            average: times.reduce((sum, time) => sum + time, 0) / times.length,
            min: times[0] || 0,
            max: times[times.length - 1] || 0
        });

        return {
            requestProcessing: calculateStats(requestTimes),
            targetProcessing: calculateStats(targetTimes),
            responseProcessing: calculateStats(responseTimes),
            total: calculateStats(totalTimes)
        };
    }

    /**
     * Calculate client IP statistics
     */
    private calculateConnectionStats(entries: ParsedLogEntry[]): ConnectionStats[] {
        if (entries.length === 0) return [];

        const connectionData = new Map<string, {
            count: number;
            responseTimes: number[];
            errors: number;
            endpoints: Set<string>;
        }>();

        entries.forEach(entry => {
            // Skip entries without connection_id
            if (!entry.connectionId) return;
            
            const responseTime = (entry.requestProcessingTime + entry.targetProcessingTime + entry.responseProcessingTime) * 1000;
            const isError = entry.elbStatusCode >= 400;

            const existing = connectionData.get(entry.connectionId);

            if (existing) {
                existing.count++;
                existing.responseTimes.push(responseTime);
                if (isError) existing.errors++;
                existing.endpoints.add(entry.requestUrl);
            } else {
                connectionData.set(entry.connectionId, {
                    count: 1,
                    responseTimes: [responseTime],
                    errors: isError ? 1 : 0,
                    endpoints: new Set([entry.requestUrl])
                });
            }
        });

        const total = entries.length;

        return Array.from(connectionData.entries())
            .map(([connectionId, data]) => ({
                connectionId,
                count: data.count,
                percentage: (data.count / total) * 100,
                averageResponseTime: data.responseTimes.reduce((sum, time) => sum + time, 0) / data.responseTimes.length,
                errorRate: (data.errors / data.count) * 100,
                endpoints: Array.from(data.endpoints).slice(0, 5) // Top 5 endpoints per connection
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20); // Top 20 connections
    }

    /**
     * Calculate status code trends over time
     */
    private calculateStatusCodeTrends(entries: ParsedLogEntry[]): StatusCodeTrends[] {
        if (entries.length === 0) return [];

        // Group by hour
        const hourlyData = new Map<string, {
            success: number;  // 2xx
            clientError: number;  // 4xx
            serverError: number;  // 5xx
            total: number;
        }>();

        entries.forEach(entry => {
            const hour = new Date(entry.timestamp);
            hour.setMinutes(0, 0, 0);
            const key = hour.toISOString();

            const existing = hourlyData.get(key) || { success: 0, clientError: 0, serverError: 0, total: 0 };
            
            if (entry.elbStatusCode >= 200 && entry.elbStatusCode < 300) {
                existing.success++;
            } else if (entry.elbStatusCode >= 400 && entry.elbStatusCode < 500) {
                existing.clientError++;
            } else if (entry.elbStatusCode >= 500) {
                existing.serverError++;
            }
            existing.total++;

            hourlyData.set(key, existing);
        });

        return Array.from(hourlyData.entries())
            .map(([timestamp, data]) => ({
                timestamp,
                successRate: (data.success / data.total) * 100,
                clientErrorRate: (data.clientError / data.total) * 100,
                serverErrorRate: (data.serverError / data.total) * 100
            }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    /**
     * Identify error patterns
     */
    private identifyErrorPatterns(entries: ParsedLogEntry[]): ErrorPattern[] {
        const errorEntries = entries.filter(e => e.elbStatusCode >= 400);
        if (errorEntries.length === 0) return [];

        // Group errors by status code and endpoint
        const errorGroups = new Map<string, {
            statusCode: number;
            endpoint: string;
            entries: ParsedLogEntry[];
        }>();

        errorEntries.forEach(entry => {
            const key = `${entry.elbStatusCode}-${entry.requestUrl}`;
            const existing = errorGroups.get(key);

            if (existing) {
                existing.entries.push(entry);
            } else {
                errorGroups.set(key, {
                    statusCode: entry.elbStatusCode,
                    endpoint: entry.requestUrl,
                    entries: [entry]
                });
            }
        });

        return Array.from(errorGroups.values())
            .filter(group => group.entries.length >= 5) // Only patterns with 5+ occurrences
            .map(group => {
                const sortedEntries = group.entries.sort((a, b) => 
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );

                return {
                    statusCode: group.statusCode,
                    endpoint: group.endpoint,
                    count: group.entries.length,
                    timeRange: {
                        start: sortedEntries[0].timestamp.toISOString(),
                        end: sortedEntries[sortedEntries.length - 1].timestamp.toISOString()
                    },
                    sampleErrors: sortedEntries.slice(0, 3).map(e => 
                        `${e.timestamp}: ${e.requestVerb} ${e.requestUrl} - ${e.elbStatusCode}`
                    )
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10 error patterns
    }

    /**
     * Calculate percentile from sorted array
     */
    private percentile(sortedArray: number[], percentile: number): number {
        if (sortedArray.length === 0) return 0;

        const index = Math.ceil(sortedArray.length * percentile) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }

    /**
     * Normalize user agent string for grouping
     */
    private normalizeUserAgent(userAgent: string): string {
        // Extract browser/client name and version
        if (userAgent.includes('Chrome/')) {
            const match = userAgent.match(/Chrome\/(\d+)/);
            return match ? `Chrome/${match[1]}` : 'Chrome';
        }

        if (userAgent.includes('Firefox/')) {
            const match = userAgent.match(/Firefox\/(\d+)/);
            return match ? `Firefox/${match[1]}` : 'Firefox';
        }

        if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
            const match = userAgent.match(/Version\/(\d+)/);
            return match ? `Safari/${match[1]}` : 'Safari';
        }

        if (userAgent.includes('Edge/')) {
            const match = userAgent.match(/Edge\/(\d+)/);
            return match ? `Edge/${match[1]}` : 'Edge';
        }

        if (userAgent.includes('curl/')) {
            const match = userAgent.match(/curl\/(\d+\.\d+)/);
            return match ? `curl/${match[1]}` : 'curl';
        }

        if (userAgent.includes('bot') || userAgent.includes('Bot') || userAgent.includes('crawler')) {
            if (userAgent.includes('Googlebot')) return 'Googlebot';
            if (userAgent.includes('Bingbot')) return 'Bingbot';
            if (userAgent.includes('facebookexternalhit')) return 'Facebook Bot';
            return 'Bot/Crawler';
        }

        // Return first 50 characters for unknown user agents
        return userAgent.substring(0, 50);
    }

    /**
     * Categorize user agent into broad categories
     */
    private categorizeUserAgent(userAgent: string): string {
        const originalUserAgent = userAgent; // Keep original for categorization

        if (originalUserAgent.includes('Chrome') || originalUserAgent.includes('Firefox') ||
            originalUserAgent.includes('Safari') || originalUserAgent.includes('Edge') ||
            originalUserAgent.includes('Mozilla')) {
            return 'Desktop Browser';
        }

        if (originalUserAgent.includes('Mobile') || originalUserAgent.includes('iPhone') ||
            originalUserAgent.includes('Android')) {
            return 'Mobile Browser';
        }

        if (originalUserAgent.includes('bot') || originalUserAgent.includes('Bot') ||
            originalUserAgent.includes('crawler') || originalUserAgent.includes('Googlebot') ||
            originalUserAgent.includes('Bingbot')) {
            return 'Bot';
        }

        if (originalUserAgent.includes('curl') || originalUserAgent.includes('wget') ||
            originalUserAgent.includes('HTTPie')) {
            return 'CLI Tool';
        }

        return 'Other';
    }
}
