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
  extractedSessionToken?: string;
}

export interface WorkflowPattern {
  id: string;
  sequence: string[];
  frequency: number;
  averageDuration: number;
  successRate: number;
  averageRequestCount: number;
  userSegments: Record<string, number>; // Map serialized as object
  examples: string[]; // Sample session IDs
}

export interface TransitionProbability {
  from: string;
  to: string;
  probability: number;
  count: number;
  averageTime: number;
}

export interface DropOffPoint {
  endpoint: string;
  dropOffRate: number;
  averageTimeSpent: number;
  totalOccurrences: number;
  continuePatterns: Record<string, number>; // Map serialized as object
}

export interface WorkflowAnalysis {
  patterns: WorkflowPattern[];
  transitionMatrix: Record<string, Record<string, TransitionProbability>>; // Map serialized as nested object
  entryPoints: Record<string, number>; // Map serialized as object
  exitPoints: Record<string, number>; // Map serialized as object
  dropOffPoints: DropOffPoint[];
  commonSequences: Array<{
    sequence: string[];
    count: number;
    percentage: number;
  }>;
}

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

export interface WorkflowAnalysisResult {
  sessions: Session[];
  analysis: WorkflowAnalysis;
  summary: WorkflowSummary;
  processingTime: number;
  timestamp: Date;
}

export interface WorkflowFilterCriteria {
  timeRange?: {
    start: Date;
    end: Date;
  };
  endpoints?: string[];
  statusCodes?: number[];
  clientIps?: string[];
  userAgentPatterns?: string[];
  // Workflow-specific filtering options
  excludeEndpoints?: string[];
  includeOnlyEndpoints?: string[];
  excludeUserAgents?: string[];
  minSessionDuration?: number;
}

export interface WorkflowAnalysisOptions {
  excludeEndpoints?: string[];
  includeOnlyEndpoints?: string[];
  minSessionDuration?: number;
  excludeUserAgents?: string[];
}

// Visualization-specific types
export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  level: number;
  category: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  probability: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface FlowChartNode {
  id: string;
  type: 'endpoint' | 'entry' | 'exit' | 'dropoff';
  position: { x: number; y: number };
  data: {
    label: string;
    endpoint: string;
    count: number;
    percentage: number;
    dropOffRate?: number;
    avgResponseTime?: number;
  };
  style?: {
    background?: string;
    color?: string;
    border?: string;
    width?: number;
    height?: number;
  };
}

export interface FlowChartEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep' | 'straight' | 'step';
  animated?: boolean;
  label?: string;
  data: {
    probability: number;
    count: number;
    averageTime: number;
  };
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
  labelStyle?: {
    fill?: string;
    fontWeight?: number;
  };
}

export interface FlowChartData {
  nodes: FlowChartNode[];
  edges: FlowChartEdge[];
}

export interface TransitionMatrixCell {
  from: string;
  to: string;
  probability: number;
  count: number;
  averageTime: number;
}

export interface SessionTimelineEvent {
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  index: number;
}

export interface SessionTimeline {
  sessionId: string;
  events: SessionTimelineEvent[];
  duration: number;
  startTime: Date;
  endTime: Date;
}