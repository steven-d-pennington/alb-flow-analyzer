# ALB Log Parser

This module provides functionality to parse AWS Application Load Balancer (ALB) flow logs into structured data for analysis.

## Features

- **Complete ALB Log Support**: Parses all 29 fields from ALB access logs
- **Error Handling**: Gracefully handles malformed entries with detailed error messages
- **IPv6 Support**: Correctly parses IPv6 addresses in bracket notation
- **Validation**: Validates parsed entries for data integrity
- **Type Safety**: Full TypeScript support with comprehensive type definitions

## Usage

### Basic Usage

```typescript
import { ALBLogParser, createLogParser } from './parser';

const parser = createLogParser();

const logLine = `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`;

const result = parser.parseEntry(logLine);

if (result.success) {
  console.log('Parsed entry:', result.entry);
  console.log('Client IP:', result.entry.clientIp);
  console.log('Status Code:', result.entry.elbStatusCode);
  console.log('Request URL:', result.entry.requestUrl);
} else {
  console.error('Parsing failed:', result.error);
}
```

### Batch Processing with Error Tracking

```typescript
import { ALBLogParser, ParsingStats, ParseError } from './parser';

const parser = new ALBLogParser();
const logLines = [
  // ... array of log lines
];

const stats: ParsingStats = {
  totalLines: 0,
  successfullyParsed: 0,
  failed: 0,
  errors: []
};

const parsedEntries = [];

logLines.forEach((line, index) => {
  stats.totalLines++;
  const result = parser.parseEntry(line);
  
  if (result.success) {
    stats.successfullyParsed++;
    parsedEntries.push(result.entry);
  } else {
    stats.failed++;
    stats.errors.push({
      lineNumber: index + 1,
      line: line,
      error: result.error,
      timestamp: new Date()
    });
  }
});

console.log(`Processed ${stats.totalLines} lines`);
console.log(`Successfully parsed: ${stats.successfullyParsed}`);
console.log(`Failed: ${stats.failed}`);

if (stats.errors.length > 0) {
  console.log('Errors:');
  stats.errors.forEach(error => {
    console.log(`Line ${error.lineNumber}: ${error.error}`);
  });
}
```

## Parsed Entry Structure

The parser extracts the following fields from ALB logs:

```typescript
interface ParsedLogEntry {
  timestamp: Date;                    // Request timestamp
  clientIp: string;                   // Client IP address
  targetIp: string;                   // Target IP address
  requestProcessingTime: number;      // Request processing time (seconds)
  targetProcessingTime: number;       // Target processing time (seconds)
  responseProcessingTime: number;     // Response processing time (seconds)
  elbStatusCode: number;              // ELB status code
  targetStatusCode: number;           // Target status code
  receivedBytes: number;              // Bytes received
  sentBytes: number;                  // Bytes sent
  requestVerb: string;                // HTTP method (GET, POST, etc.)
  requestUrl: string;                 // Request URL
  requestProtocol: string;            // HTTP protocol version
  userAgent: string;                  // User agent string
  sslCipher?: string;                 // SSL cipher (optional)
  sslProtocol?: string;               // SSL protocol (optional)
  targetGroupArn: string;             // Target group ARN
  traceId: string;                    // X-Ray trace ID
  domainName: string;                 // Domain name
  chosenCertArn?: string;             // SSL certificate ARN (optional)
  matchedRulePriority: number;        // Matched rule priority
  requestCreationTime: Date;          // Request creation time
  actionsExecuted: string;            // Actions executed
  redirectUrl?: string;               // Redirect URL (optional)
  errorReason?: string;               // Error reason (optional)
  targetPortList: string;             // Target port list
  targetStatusCodeList: string;       // Target status code list
  classification: string;             // Classification
  classificationReason: string;       // Classification reason
}
```

## Error Handling

The parser handles various error conditions:

- **Empty lines**: Returns error "Empty log line"
- **Insufficient fields**: Returns error about field count
- **Invalid timestamps**: Returns error with timestamp format details
- **Invalid status codes**: Returns error about invalid status code
- **Invalid HTTP requests**: Returns error about request format
- **Invalid IP addresses**: Returns error about address format

## Supported Log Formats

The parser supports the standard ALB access log format with 29 fields:

```
type timestamp elb client:port target:port request_processing_time target_processing_time response_processing_time elb_status_code target_status_code received_bytes sent_bytes "request" "user_agent" ssl_cipher ssl_protocol target_group_arn "trace_id" "domain_name" "chosen_cert_arn" matched_rule_priority request_creation_time "actions_executed" "redirect_url" "lambda_error_reason" "target_port_list" "target_status_code_list" "classification" "classification_reason"
```

## Special Value Handling

- **Dash values (`-`)**: Converted to appropriate defaults (empty strings for text, 0 for numbers)
- **Quoted strings**: Quotes are automatically removed
- **IPv6 addresses**: Bracket notation `[::1]:port` is correctly parsed
- **Missing targets**: Handled gracefully for error responses (502, etc.)

## Testing

The parser includes comprehensive tests covering:

- Valid log entries (HTTP, HTTPS, errors, redirects)
- Malformed entries (empty lines, invalid formats)
- Edge cases (IPv6, long URLs, special characters)
- Integration scenarios with batch processing

Run tests with:

```bash
npm test parser
```

## Requirements Satisfied

This implementation satisfies the following requirements from the ALB Flow Analyzer specification:

- **1.1**: Parses standard ALB flow log format
- **1.2**: Extracts all required fields (timestamp, IPs, processing times, status codes, etc.)
- **1.3**: Handles malformed entries with error logging
- **1.4**: Provides processing summary with success/failure counts