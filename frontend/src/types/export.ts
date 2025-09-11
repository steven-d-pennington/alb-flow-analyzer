export interface TestRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  weight: number;
}

export interface TestScenario {
  name: string;
  weight: number;
  requests: TestRequest[];
  thinkTime: number;
}

export interface AWSLoadTestConfig {
  testName: string;
  testDescription: string;
  taskCount: number;
  concurrency: number;
  rampUpTime: number;
  holdForTime: number;
  rampDownTime: number;
  scenarios: TestScenario[];
  regions: string[];
}

export interface ExportFormat {
  id: string;
  name: string;
  description: string;
  fileExtension: string;
  mimeType: string;
}

export interface DownloadProgress {
  isDownloading: boolean;
  progress: number;
  fileName?: string;
  error?: string;
}

export interface ExportOptions {
  format: string;
  includeCharts: boolean;
  includeRawData: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'csv',
    name: 'CSV',
    description: 'Comma-separated values for spreadsheet applications',
    fileExtension: 'csv',
    mimeType: 'text/csv'
  },
  {
    id: 'json',
    name: 'JSON',
    description: 'JavaScript Object Notation for programmatic consumption',
    fileExtension: 'json',
    mimeType: 'application/json'
  },
  {
    id: 'report',
    name: 'HTML Report',
    description: 'Human-readable report with charts and insights',
    fileExtension: 'html',
    mimeType: 'text/html'
  },
  {
    id: 'aws-load-test',
    name: 'JMeter Test Plan',
    description: 'JMeter test plan file (.jmx) for load testing based on ALB log analysis',
    fileExtension: 'jmx',
    mimeType: 'application/xml'
  }
];