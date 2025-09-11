import { ALBLogParser } from '../LogParser';
import { ParseError, ParsingStats } from '../types';

describe('ALBLogParser Integration', () => {
  let parser: ALBLogParser;

  beforeEach(() => {
    parser = new ALBLogParser();
  });

  it('should process multiple log entries and provide statistics', () => {
    const logLines = [
      // Valid entry
      `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
      
      // Empty line (should fail)
      '',
      
      // Another valid entry
      `https 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.086 0.048 0.037 200 200 0 57 "GET https://www.example.com:443/index.html HTTP/1.1" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337281-1d84f3d73c47ec4e58577259" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 1 2018-07-02T22:23:00.186000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
      
      // Invalid timestamp (should fail)
      `http invalid-timestamp app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`
    ];

    const results = logLines.map((line, index) => {
      const result = parser.parseEntry(line);
      return { ...result, lineNumber: index + 1 };
    });

    const stats: ParsingStats = {
      totalLines: logLines.length,
      successfullyParsed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      errors: results
        .filter(r => !r.success)
        .map(r => ({
          lineNumber: r.lineNumber!,
          line: logLines[r.lineNumber! - 1],
          error: r.error!,
          timestamp: new Date()
        }))
    };

    expect(stats.totalLines).toBe(4);
    expect(stats.successfullyParsed).toBe(2);
    expect(stats.failed).toBe(2);
    expect(stats.errors).toHaveLength(2);
    
    // Check that we have meaningful error messages
    expect(stats.errors[0].error).toBe('Empty log line');
    expect(stats.errors[1].error).toContain('Invalid timestamp format');
    
    // Check that successful entries have the expected data
    const successfulEntries = results.filter(r => r.success).map(r => r.entry!);
    expect(successfulEntries[0].requestVerb).toBe('GET');
    expect(successfulEntries[0].elbStatusCode).toBe(200);
    expect(successfulEntries[1].requestVerb).toBe('GET');
    expect(successfulEntries[1].elbStatusCode).toBe(200);
  });

  it('should handle various ALB log scenarios', () => {
    const scenarios = [
      {
        name: 'Standard HTTP request',
        log: `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
        shouldSucceed: true
      },
      {
        name: 'Error response (502)',
        log: `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 - 0.000 0.000 0.000 502 - 34 0 "GET http://www.example.com:80/health HTTP/1.1" "ELB-HealthChecker/2.0" - - arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "-" 0 2018-07-02T22:22:58.364000Z "forward" "-" "TargetNotFound" "-" "-" "-" "-"`,
        shouldSucceed: true
      },
      {
        name: 'Redirect response',
        log: `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 - 0.000 0.000 0.000 301 - 34 366 "GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "-" 0 2018-07-02T22:22:58.364000Z "redirect" "https://www.example.com:443/" "-" "-" "-" "-" "-"`,
        shouldSucceed: true
      },
      {
        name: 'IPv6 addresses',
        log: `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 [2001:db8::1]:2817 [2001:db8::2]:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "[2001:db8::2]:80" "200" "-" "-"`,
        shouldSucceed: true
      }
    ];

    scenarios.forEach(scenario => {
      const result = parser.parseEntry(scenario.log);
      
      if (scenario.shouldSucceed) {
        expect(result.success).toBe(true);
        expect(result.entry).toBeDefined();
        expect(result.error).toBeUndefined();
      } else {
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.entry).toBeUndefined();
      }
    });
  });
});