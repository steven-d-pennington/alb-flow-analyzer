// Types specific to ALB flow log parsing

export interface ParsedLogEntry {
  timestamp: Date;
  clientIp: string;
  targetIp: string;
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
  sslCipher: string;
  sslProtocol: string;
  targetGroupArn: string;
  traceId: string;
  domainName: string;
  chosenCertArn: string;
  matchedRulePriority: number;
  requestCreationTime: Date;
  actionsExecuted: string;
  redirectUrl: string;
  errorReason: string;
  targetPortList: string;
  targetStatusCodeList: string;
  classification: string;
  classificationReason: string;
  connectionId: string;
}

export interface LogFields {
  [key: string]: string | number | Date | undefined;
}

export interface ParseResult {
  success: boolean;
  entry?: ParsedLogEntry;
  error?: string;
  lineNumber?: number;
}

export interface LogParser {
  parseEntry(logLine: string): ParseResult;
  extractFields(logLine: string): LogFields;
  validateParsedEntry(entry: ParsedLogEntry): boolean;
}

export interface ParsingStats {
  totalLines: number;
  successfullyParsed: number;
  failed: number;
  errors: ParseError[];
}

export interface ParseError {
  lineNumber: number;
  line: string;
  error: string;
  timestamp: Date;
}