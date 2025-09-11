import { LogParser, ParsedLogEntry, LogFields, ParseResult, ParseError } from './types';

/**
 * ALB Flow Log Parser
 * 
 * Parses AWS Application Load Balancer flow logs according to the standard format:
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html
 * 
 * Standard ALB flow log format (space-separated):
 * type version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes windowstart windowend action flowlogstatus
 * 
 * Extended ALB access log format (space-separated with quoted strings):
 * type timestamp elb client:port target:port request_processing_time target_processing_time response_processing_time 
 * elb_status_code target_status_code received_bytes sent_bytes "request" "user_agent" ssl_cipher ssl_protocol 
 * target_group_arn "trace_id" "domain_name" "chosen_cert_arn" matched_rule_priority request_creation_time 
 * "actions_executed" "redirect_url" "lambda_error_reason" "target_port_list" "target_status_code_list" 
 * "classification" "classification_reason" connection_id
 */
export class ALBLogParser implements LogParser {
  private static readonly FIELD_COUNT_V2 = 32; // Latest ALB log format (with connection_id)
  private static readonly FIELD_COUNT_V1 = 30; // Older ALB log format (without connection_id and other newer fields)
  
  /**
   * Parse a single ALB flow log entry
   */
  parseEntry(logLine: string): ParseResult {
    try {
      if (!logLine || logLine.trim().length === 0) {
        return {
          success: false,
          error: 'Empty log line'
        };
      }

      const fields = this.extractFields(logLine);
      const entry = this.mapFieldsToEntry(fields);
      
      if (!this.validateParsedEntry(entry)) {
        return {
          success: false,
          error: 'Validation failed for parsed entry'
        };
      }

      return {
        success: true,
        entry
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      };
    }
  }

  /**
   * Extract fields from a log line, handling quoted strings properly
   */
  extractFields(logLine: string): LogFields {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < logLine.length) {
      const char = logLine[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ' ' && !inQuotes) {
        if (current.length > 0) {
          fields.push(current);
          current = '';
        }
      } else {
        current += char;
      }
      i++;
    }
    
    // Add the last field
    if (current.length > 0) {
      fields.push(current);
    }

    // DEBUG: Log field count and sample for malformed entries
    const isV1Format = fields.length === ALBLogParser.FIELD_COUNT_V1;
    const isV2Format = fields.length >= ALBLogParser.FIELD_COUNT_V2;
    
    if (!isV1Format && !isV2Format) {
      console.log(`🔍 DEBUG: Unexpected field count - Expected ${ALBLogParser.FIELD_COUNT_V1} (v1) or ${ALBLogParser.FIELD_COUNT_V2}+ (v2), got ${fields.length}`);
      console.log(`🔍 DEBUG: First few fields: ${fields.slice(0, 5).join(' | ')}`);
      console.log(`🔍 DEBUG: Log line (first 200 chars): ${logLine.substring(0, 200)}`);
    } else {
      console.log(`✅ DEBUG: Detected ALB log format ${isV1Format ? 'v1' : 'v2'} (${fields.length} fields)`);
    }

    // Map fields to named properties
    const fieldMap: LogFields = {};
    
    if (isV1Format || isV2Format) {
      fieldMap.type = fields[0];
      fieldMap.timestamp = this.parseTimestamp(fields[1]);
      fieldMap.elb = fields[2];
      fieldMap.clientPort = fields[3];
      fieldMap.targetPort = fields[4];
      fieldMap.requestProcessingTime = this.parseFloat(fields[5]);
      fieldMap.targetProcessingTime = this.parseFloat(fields[6]);
      fieldMap.responseProcessingTime = this.parseFloat(fields[7]);
      fieldMap.elbStatusCode = this.parseInt(fields[8]);
      fieldMap.targetStatusCode = this.parseInt(fields[9]);
      fieldMap.receivedBytes = this.parseInt(fields[10]);
      fieldMap.sentBytes = this.parseInt(fields[11]);
      fieldMap.request = this.cleanQuotedString(fields[12]);
      fieldMap.userAgent = this.cleanQuotedString(fields[13]);
      fieldMap.sslCipher = this.cleanQuotedString(fields[14]);
      fieldMap.sslProtocol = this.cleanQuotedString(fields[15]);
      fieldMap.targetGroupArn = this.cleanQuotedString(fields[16]);
      fieldMap.traceId = this.cleanQuotedString(fields[17]);
      fieldMap.domainName = this.cleanQuotedString(fields[18]);
      fieldMap.chosenCertArn = this.cleanQuotedString(fields[19]);
      fieldMap.matchedRulePriority = this.parseInt(fields[20]);
      fieldMap.requestCreationTime = this.parseTimestamp(fields[21]);
      fieldMap.actionsExecuted = this.cleanQuotedString(fields[22]);
      fieldMap.redirectUrl = this.cleanQuotedString(fields[23]);
      fieldMap.errorReason = this.cleanQuotedString(fields[24]);
      fieldMap.targetPortList = this.cleanQuotedString(fields[25]);
      fieldMap.targetStatusCodeList = this.cleanQuotedString(fields[26]);
      fieldMap.classification = this.cleanQuotedString(fields[27]);
      fieldMap.classificationReason = this.cleanQuotedString(fields[28]);
      
      // Additional fields - these appear in newer ALB log formats
      if (isV2Format) {
        // V2 format (32+ fields) - includes newer fields
        fieldMap.newField1 = this.cleanQuotedString(fields[29]); // unknown field
        fieldMap.newField2 = this.cleanQuotedString(fields[30]); // unknown field  
        fieldMap.connectionId = this.cleanQuotedString(fields[31]); // TID_xxx connection identifier
      } else if (isV1Format) {
        // V1 format (30 fields) - missing newer fields, set defaults
        fieldMap.connectionId = ''; // Not available in v1 format
      }
    } else {
      // Handle unsupported format - return empty field map
      console.log(`❌ DEBUG: Unsupported ALB log format (${fields.length} fields)`);
    }

    return fieldMap;
  }

  /**
   * Validate that a parsed entry contains required fields and valid data
   */
  validateParsedEntry(entry: ParsedLogEntry): boolean {
    // Check required fields
    if (!entry.timestamp || isNaN(entry.timestamp.getTime())) {
      console.log('🔍 DEBUG: Validation failed - invalid timestamp:', entry.timestamp);
      return false;
    }
    
    // Client IP can be empty for some error cases, but target IP should be present for successful requests
    // Allow empty target IP for error cases (like 502 errors)
    
    if (typeof entry.elbStatusCode !== 'number' || entry.elbStatusCode < 100 || entry.elbStatusCode > 599) {
      console.log('🔍 DEBUG: Validation failed - invalid elbStatusCode:', entry.elbStatusCode);
      return false;
    }
    
    // Target status code can be 0 for cases where target is not reached
    if (typeof entry.targetStatusCode !== 'number' || entry.targetStatusCode < 0) {
      console.log('🔍 DEBUG: Validation failed - invalid targetStatusCode:', entry.targetStatusCode);
      return false;
    }
    
    if (!entry.requestVerb || !entry.requestUrl || !entry.requestProtocol) {
      console.log('🔍 DEBUG: Validation failed - missing request fields:', {
        requestVerb: entry.requestVerb,
        requestUrl: entry.requestUrl,
        requestProtocol: entry.requestProtocol
      });
      return false;
    }
    
    if (!entry.targetGroupArn || !entry.traceId) {
      console.log('🔍 DEBUG: Validation failed - missing required fields:', {
        targetGroupArn: entry.targetGroupArn ? 'present' : 'missing',
        traceId: entry.traceId ? 'present' : 'missing'
      });
      return false;
    }

    return true;
  }

  /**
   * Map extracted fields to ParsedLogEntry structure
   */
  private mapFieldsToEntry(fields: LogFields): ParsedLogEntry {
    // Parse client and target addresses from "ip:port" format
    const clientParts = this.parseAddressPort(fields.clientPort as string);
    const targetParts = this.parseAddressPort(fields.targetPort as string);
    
    // Parse HTTP request line
    const requestParts = this.parseRequestLine(fields.request as string);

    return {
      timestamp: fields.timestamp as Date,
      clientIp: clientParts.ip,
      targetIp: targetParts.ip,
      requestProcessingTime: fields.requestProcessingTime as number,
      targetProcessingTime: fields.targetProcessingTime as number,
      responseProcessingTime: fields.responseProcessingTime as number,
      elbStatusCode: fields.elbStatusCode as number,
      targetStatusCode: fields.targetStatusCode as number,
      receivedBytes: fields.receivedBytes as number,
      sentBytes: fields.sentBytes as number,
      requestVerb: requestParts.method,
      requestUrl: requestParts.url,
      requestProtocol: requestParts.protocol,
      userAgent: fields.userAgent as string,
      sslCipher: fields.sslCipher as string || '',
      sslProtocol: fields.sslProtocol as string || '',
      targetGroupArn: fields.targetGroupArn as string,
      traceId: fields.traceId as string,
      domainName: fields.domainName as string,
      chosenCertArn: fields.chosenCertArn as string || '',
      matchedRulePriority: fields.matchedRulePriority as number,
      requestCreationTime: fields.requestCreationTime as Date,
      actionsExecuted: fields.actionsExecuted as string,
      redirectUrl: fields.redirectUrl as string || '',
      errorReason: fields.errorReason as string || '',
      targetPortList: fields.targetPortList as string,
      targetStatusCodeList: fields.targetStatusCodeList as string,
      classification: fields.classification as string,
      classificationReason: fields.classificationReason as string,
      connectionId: fields.connectionId as string || ''
    };
  }

  /**
   * Parse timestamp in ISO format
   */
  private parseTimestamp(timestampStr: string): Date {
    if (!timestampStr || timestampStr === '-') {
      throw new Error('Invalid timestamp');
    }
    
    const date = new Date(timestampStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid timestamp format: ${timestampStr}`);
    }
    
    return date;
  }

  /**
   * Parse float value, handling '-' as 0
   */
  private parseFloat(value: string): number {
    if (!value || value === '-') {
      return 0;
    }
    
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Invalid float value: ${value}`);
    }
    
    return parsed;
  }

  /**
   * Parse integer value, handling '-' as 0
   */
  private parseInt(value: string): number {
    if (!value || value === '-') {
      return 0;
    }
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid integer value: ${value}`);
    }
    
    return parsed;
  }

  /**
   * Clean quoted strings by removing surrounding quotes and handling '-'
   */
  private cleanQuotedString(value: string): string {
    if (!value) {
      return '';
    }
    
    // Handle quoted dash
    if (value === '"-"') {
      return '';
    }
    
    // Handle unquoted dash
    if (value === '-') {
      return '';
    }
    
    // Remove surrounding quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }
    
    return value;
  }

  /**
   * Parse "ip:port" format, handling IPv6 addresses in brackets
   */
  private parseAddressPort(addressPort: string): { ip: string; port: number } {
    if (!addressPort || addressPort === '-') {
      return { ip: '', port: 0 };
    }
    
    // Handle IPv6 addresses in brackets [::1]:port
    if (addressPort.startsWith('[')) {
      const closeBracketIndex = addressPort.indexOf(']');
      if (closeBracketIndex === -1) {
        throw new Error(`Invalid IPv6 address format: ${addressPort}`);
      }
      
      const ip = addressPort.substring(1, closeBracketIndex); // Remove brackets
      const portPart = addressPort.substring(closeBracketIndex + 1);
      
      if (!portPart.startsWith(':')) {
        throw new Error(`Invalid IPv6 address:port format: ${addressPort}`);
      }
      
      const port = parseInt(portPart.substring(1), 10);
      if (isNaN(port)) {
        throw new Error(`Invalid port in IPv6 address:port: ${addressPort}`);
      }
      
      return { ip, port };
    }
    
    // Handle IPv4 addresses
    const lastColonIndex = addressPort.lastIndexOf(':');
    if (lastColonIndex === -1) {
      throw new Error(`Invalid address:port format: ${addressPort}`);
    }
    
    const ip = addressPort.substring(0, lastColonIndex);
    const portStr = addressPort.substring(lastColonIndex + 1);
    const port = parseInt(portStr, 10);
    
    if (isNaN(port)) {
      throw new Error(`Invalid port in address:port: ${addressPort}`);
    }
    
    return { ip, port };
  }

  /**
   * Parse HTTP request line "METHOD /path HTTP/1.1"
   */
  private parseRequestLine(request: string): { method: string; url: string; protocol: string } {
    if (!request || request === '-') {
      return { method: '', url: '', protocol: '' };
    }
    
    const parts = request.split(' ');
    if (parts.length !== 3) {
      throw new Error(`Invalid HTTP request format: ${request}`);
    }
    
    // Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'TRACE', 'CONNECT'];
    if (!validMethods.includes(parts[0].toUpperCase())) {
      throw new Error(`Invalid HTTP method: ${parts[0]}`);
    }
    
    // Validate protocol
    if (!parts[2].startsWith('HTTP/')) {
      throw new Error(`Invalid HTTP protocol: ${parts[2]}`);
    }
    
    return {
      method: parts[0],
      url: parts[1],
      protocol: parts[2]
    };
  }
}