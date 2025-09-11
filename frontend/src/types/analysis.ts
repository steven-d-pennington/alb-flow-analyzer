export interface ParsedLogEntry {
  timestamp: Date;
  clientIp: string;
  targetIp: string;
  connectionId?: string;
  requestProcessingTime: number;
  targetProcessingTime: number;
  responseProcessingTime: number;
  elbStatusCode: number;
  targetStatusCode: number;
  receivedBytes: number;
  sentBytes: number;
  requestVerb: string;
  requestUrl: string;
  requestProtocol: string;
  userAgent: string;
  sslCipher?: string;
  sslProtocol?: string;
  targetGroupArn: string;
  traceId: string;
  domainName: string;
  chosenCertArn?: string;
  matchedRulePriority: number;
  requestCreationTime: Date;
  actionsExecuted: string;
  redirectUrl?: string;
  errorReason?: string;
  targetPortList: string;
  targetStatusCodeList: string;
  classification: string;
  classificationReason: string;
}

export interface TimeSeries {
  timestamp: Date;
  value: number;
}

export interface PeakPeriod {
  startTime: Date;
  endTime: Date;
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
  timeRange: { start: Date; end: Date };
  sampleErrors: string[];
}

export interface StatusCodeTrends {
  timestamp: string;
  successRate: number;  // 2xx
  clientErrorRate: number;  // 4xx
  serverErrorRate: number;  // 5xx
}

export interface ResponseTimeBreakdown {
  requestProcessing: ResponseTimeStats;
  targetProcessing: ResponseTimeStats;
  responseProcessing: ResponseTimeStats;
  total: ResponseTimeStats;
}

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

export interface FilterCriteria {
  timeRange?: {
    start: Date;
    end: Date;
  };
  endpoints?: string[];
  statusCodes?: number[];
  clientIps?: string[];
  connectionIds?: string[];
  userAgentPatterns?: string[];
}

export interface AnalysisResult {
  metrics: TrafficMetrics;
  filteredEntryCount: number;
  totalEntryCount: number;
  processingTime: number;
  lastUpdated: Date;
}

export interface ChartData {
  name: string;
  data: Array<{
    x: string | number;
    y: number;
    [key: string]: any;
  }>;
  type: 'line' | 'bar' | 'pie' | 'area';
}