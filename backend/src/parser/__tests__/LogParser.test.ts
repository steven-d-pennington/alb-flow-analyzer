import { ALBLogParser } from '../LogParser';
import { ParsedLogEntry, ParseResult } from '../types';
import { validLogEntries, malformedLogEntries, edgeCaseLogEntries } from '../testData';

describe('ALBLogParser', () => {
  let parser: ALBLogParser;

  beforeEach(() => {
    parser = new ALBLogParser();
  });

  describe('parseEntry', () => {
    it('should successfully parse a valid ALB log entry', () => {
      const logLine = validLogEntries[0];
      const result: ParseResult = parser.parseEntry(logLine);

      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.error).toBeUndefined();

      const entry = result.entry!;
      expect(entry.clientIp).toBe('192.168.131.39');
      expect(entry.targetIp).toBe('10.0.0.1');
      expect(entry.elbStatusCode).toBe(200);
      expect(entry.targetStatusCode).toBe(200);
      expect(entry.requestVerb).toBe('GET');
      expect(entry.requestUrl).toBe('https://www.example.com:443/');
      expect(entry.requestProtocol).toBe('HTTP/1.1');
      expect(entry.userAgent).toBe('curl/7.46.0');
      expect(entry.domainName).toBe('www.example.com');
    });

    it('should parse HTTPS entry with SSL information', () => {
      const logLine = validLogEntries[1];
      const result: ParseResult = parser.parseEntry(logLine);

      expect(result.success).toBe(true);
      const entry = result.entry!;
      expect(entry.sslCipher).toBe('ECDHE-RSA-AES128-GCM-SHA256');
      expect(entry.sslProtocol).toBe('TLSv1.2');
      expect(entry.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    });

    it('should parse entry with error status', () => {
      const logLine = validLogEntries[2];
      const result: ParseResult = parser.parseEntry(logLine);

      expect(result.success).toBe(true);
      const entry = result.entry!;
      expect(entry.elbStatusCode).toBe(502);
      expect(entry.targetStatusCode).toBe(0); // '-' should be parsed as 0
      expect(entry.targetIp).toBe(''); // '-' should be parsed as empty string
      expect(entry.errorReason).toBe('TargetNotFound');
    });

    it('should parse entry with redirect', () => {
      const logLine = validLogEntries[3];
      const result: ParseResult = parser.parseEntry(logLine);

      expect(result.success).toBe(true);
      const entry = result.entry!;
      expect(entry.elbStatusCode).toBe(301);
      expect(entry.actionsExecuted).toBe('redirect');
      expect(entry.redirectUrl).toBe('https://www.example.com:443/');
    });

    it('should parse POST request entry', () => {
      const logLine = validLogEntries[4];
      const result: ParseResult = parser.parseEntry(logLine);

      expect(result.success).toBe(true);
      const entry = result.entry!;
      expect(entry.requestVerb).toBe('POST');
      expect(entry.requestUrl).toBe('https://api.example.com:443/users');
      expect(entry.receivedBytes).toBe(512);
      expect(entry.sentBytes).toBe(1024);
    });

    it('should handle empty log line', () => {
      const result: ParseResult = parser.parseEntry('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty log line');
      expect(result.entry).toBeUndefined();
    });

    it('should handle malformed entries gracefully', () => {
      // Test specific malformed entries individually
      const emptyLine = malformedLogEntries[0];
      const tooFewFields = malformedLogEntries[1];
      const invalidTimestamp = malformedLogEntries[2];
      const invalidStatusCode = malformedLogEntries[3];
      
      expect(parser.parseEntry(emptyLine).success).toBe(false);
      expect(parser.parseEntry(tooFewFields).success).toBe(false);
      expect(parser.parseEntry(invalidTimestamp).success).toBe(false);
      expect(parser.parseEntry(invalidStatusCode).success).toBe(false);
      
      // The "INVALID REQUEST FORMAT" entry might actually parse but fail validation
      const invalidRequestFormat = malformedLogEntries[4];
      const result = parser.parseEntry(invalidRequestFormat);
      // This should fail during HTTP request parsing
      expect(result.success).toBe(false);
    });

    it('should handle edge cases', () => {
      edgeCaseLogEntries.forEach((logLine) => {
        const result: ParseResult = parser.parseEntry(logLine);
        
        // Edge cases should still parse successfully
        expect(result.success).toBe(true);
        expect(result.entry).toBeDefined();
      });
    });
  });

  describe('extractFields', () => {
    it('should extract all fields from a valid log line', () => {
      const logLine = validLogEntries[0];
      const fields = parser.extractFields(logLine);

      expect(fields.type).toBe('http');
      expect(fields.timestamp).toBeInstanceOf(Date);
      expect(fields.elb).toBe('app/my-loadbalancer/50dc6c495c0c9188');
      expect(fields.clientPort).toBe('192.168.131.39:2817');
      expect(fields.targetPort).toBe('10.0.0.1:80');
      expect(fields.requestProcessingTime).toBe(0.000);
      expect(fields.targetProcessingTime).toBe(0.001);
      expect(fields.responseProcessingTime).toBe(0.000);
      expect(fields.elbStatusCode).toBe(200);
      expect(fields.targetStatusCode).toBe(200);
      expect(fields.receivedBytes).toBe(34);
      expect(fields.sentBytes).toBe(366);
      expect(fields.request).toBe('GET https://www.example.com:443/ HTTP/1.1');
      expect(fields.userAgent).toBe('curl/7.46.0');
    });

    it('should handle quoted strings with spaces', () => {
      const logLine = validLogEntries[1];
      const fields = parser.extractFields(logLine);

      expect(fields.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    });

    it('should handle dash values correctly', () => {
      const logLine = validLogEntries[2];
      const fields = parser.extractFields(logLine);

      expect(fields.targetPort).toBe('-');
      expect(fields.sslCipher).toBe('');  // cleanQuotedString converts '-' to ''
      expect(fields.sslProtocol).toBe(''); // cleanQuotedString converts '-' to ''
    });
  });

  describe('validateParsedEntry', () => {
    let validEntry: ParsedLogEntry;

    beforeEach(() => {
      const result = parser.parseEntry(validLogEntries[0]);
      validEntry = result.entry!;
    });

    it('should validate a correct entry', () => {
      expect(parser.validateParsedEntry(validEntry)).toBe(true);
    });

    it('should reject entry with invalid timestamp', () => {
      const invalidEntry = { ...validEntry, timestamp: new Date('invalid') };
      expect(parser.validateParsedEntry(invalidEntry)).toBe(false);
    });

    it('should allow entry with missing client IP (for error cases)', () => {
      const validEntryWithEmptyClientIp = { ...validEntry, clientIp: '' };
      expect(parser.validateParsedEntry(validEntryWithEmptyClientIp)).toBe(true);
    });

    it('should reject entry with invalid status code', () => {
      const invalidEntry = { ...validEntry, elbStatusCode: 999 };
      expect(parser.validateParsedEntry(invalidEntry)).toBe(false);
    });

    it('should reject entry with negative target status code', () => {
      const invalidEntry = { ...validEntry, targetStatusCode: -1 };
      expect(parser.validateParsedEntry(invalidEntry)).toBe(false);
    });

    it('should reject entry with missing request verb', () => {
      const invalidEntry = { ...validEntry, requestVerb: '' };
      expect(parser.validateParsedEntry(invalidEntry)).toBe(false);
    });

    it('should reject entry with missing target group ARN', () => {
      const invalidEntry = { ...validEntry, targetGroupArn: '' };
      expect(parser.validateParsedEntry(invalidEntry)).toBe(false);
    });
  });

  describe('timestamp parsing', () => {
    it('should parse ISO timestamp correctly', () => {
      const logLine = validLogEntries[0];
      const fields = parser.extractFields(logLine);
      
      expect(fields.timestamp).toBeInstanceOf(Date);
      expect((fields.timestamp as Date).getFullYear()).toBe(2018);
      expect((fields.timestamp as Date).getMonth()).toBe(6); // July (0-indexed)
      expect((fields.timestamp as Date).getDate()).toBe(2);
    });

    it('should handle different timestamp formats', () => {
      const timestamps = [
        '2018-07-02T22:22:58.364000Z',
        '2018-07-02T22:22:58.364Z',
        '2018-07-02T22:22:58Z'
      ];

      timestamps.forEach(timestamp => {
        const testLine = validLogEntries[0].replace('2018-07-02T22:22:58.364000Z', timestamp);
        const result = parser.parseEntry(testLine);
        expect(result.success).toBe(true);
        expect(result.entry!.timestamp).toBeInstanceOf(Date);
      });
    });
  });

  describe('address parsing', () => {
    it('should parse IPv4 addresses correctly', () => {
      const logLine = validLogEntries[0];
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.clientIp).toBe('192.168.131.39');
      expect(result.entry!.targetIp).toBe('10.0.0.1');
    });

    it('should parse IPv6 addresses correctly', () => {
      const logLine = edgeCaseLogEntries[0]; // IPv6 test case
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.clientIp).toBe('2001:db8::1');
      expect(result.entry!.targetIp).toBe('2001:db8::2');
    });
  });

  describe('HTTP request parsing', () => {
    it('should parse GET request correctly', () => {
      const logLine = validLogEntries[0];
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.requestVerb).toBe('GET');
      expect(result.entry!.requestUrl).toBe('https://www.example.com:443/');
      expect(result.entry!.requestProtocol).toBe('HTTP/1.1');
    });

    it('should parse POST request correctly', () => {
      const logLine = validLogEntries[4];
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.requestVerb).toBe('POST');
      expect(result.entry!.requestUrl).toBe('https://api.example.com:443/users');
      expect(result.entry!.requestProtocol).toBe('HTTP/1.1');
    });

    it('should handle long URLs', () => {
      const logLine = edgeCaseLogEntries[1]; // Long URL test case
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.requestUrl).toContain('/very/long/path');
      expect(result.entry!.requestUrl).toContain('param1=value1');
    });
  });

  describe('numeric field parsing', () => {
    it('should parse processing times correctly', () => {
      const logLine = validLogEntries[1];
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.requestProcessingTime).toBe(0.086);
      expect(result.entry!.targetProcessingTime).toBe(0.048);
      expect(result.entry!.responseProcessingTime).toBe(0.037);
    });

    it('should parse byte counts correctly', () => {
      const logLine = validLogEntries[4];
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.receivedBytes).toBe(512);
      expect(result.entry!.sentBytes).toBe(1024);
    });

    it('should handle dash values as zero', () => {
      const logLine = validLogEntries[2];
      const result = parser.parseEntry(logLine);
      
      expect(result.success).toBe(true);
      expect(result.entry!.targetProcessingTime).toBe(0);
      expect(result.entry!.responseProcessingTime).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should provide meaningful error messages', () => {
      const invalidTimestamp = malformedLogEntries[2];
      const result = parser.parseEntry(invalidTimestamp);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid timestamp format');
    });

    it('should handle parsing errors gracefully', () => {
      const tooFewFields = malformedLogEntries[1];
      const result = parser.parseEntry(tooFewFields);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});