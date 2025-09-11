// Test utilities for log ingestion tests

export const validALBLogEntries = [
  // Standard successful request
  'h2 2023-12-01T10:30:45.123456Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.100:54321 10.0.1.50:80 0.000 0.001 0.000 200 200 0 615 "GET https://example.com/api/users HTTP/1.1" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2023-12-01T10:30:45.122456Z "forward" "-" "-" "10.0.1.50:80" "200" "-" "-"',
  
  // POST request with larger payload
  'h2 2023-12-01T10:31:15.456789Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.101:54322 10.0.1.51:80 0.001 0.002 0.001 201 201 1024 256 "POST https://example.com/api/users HTTP/1.1" "curl/7.68.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337263-36d228ad5d99923122bbe355" "example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2023-12-01T10:31:15.455789Z "forward" "-" "-" "10.0.1.51:80" "201" "-" "-"',
  
  // Error response (404)
  'h2 2023-12-01T10:32:00.789012Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.102:54323 10.0.1.52:80 0.000 0.001 0.000 404 404 0 142 "GET https://example.com/api/nonexistent HTTP/1.1" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337264-36d228ad5d99923122bbe356" "example.com" "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2023-12-01T10:32:00.788012Z "forward" "-" "-" "10.0.1.52:80" "404" "-" "-"',
  
  // Server error (502)
  'h2 2023-12-01T10:33:30.012345Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.103:54324 - 0.000 -1 -1 502 - 0 142 "GET https://example.com/api/health HTTP/1.1" "HealthChecker/1.0" - - arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337265-36d228ad5d99923122bbe357" "example.com" "-" 0 2023-12-01T10:33:30.011345Z "forward" "-" "TargetFailure" "-" "-" "-" "-"',
  
  // HTTPS redirect
  'h2 2023-12-01T10:34:45.345678Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.104:54325 - 0.000 -1 -1 301 - 0 219 "GET http://example.com/api/users HTTP/1.1" "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15" - - arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337266-36d228ad5d99923122bbe358" "example.com" "-" 0 2023-12-01T10:34:45.344678Z "redirect" "https://example.com:443/api/users" "-" "-" "-" "-" "-"'
];

export const malformedLogEntries = [
  // Missing fields
  'h2 2023-12-01T10:30:45.123456Z app/my-loadbalancer/50dc6c495c0c9188',
  
  // Invalid timestamp
  'h2 invalid-timestamp app/my-loadbalancer/50dc6c495c0c9188 192.168.1.100:54321 10.0.1.50:80 0.000 0.001 0.000 200 200 0 615 "GET https://example.com/api/users HTTP/1.1" "Mozilla/5.0" - - arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "example.com" "-" 0 2023-12-01T10:30:45.122456Z "forward" "-" "-" "10.0.1.50:80" "200" "-" "-"',
  
  // Invalid status code
  'h2 2023-12-01T10:30:45.123456Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.100:54321 10.0.1.50:80 0.000 0.001 0.000 999 200 0 615 "GET https://example.com/api/users HTTP/1.1" "Mozilla/5.0" - - arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "example.com" "-" 0 2023-12-01T10:30:45.122456Z "forward" "-" "-" "10.0.1.50:80" "200" "-" "-"',
  
  // Malformed HTTP request
  'h2 2023-12-01T10:30:45.123456Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.100:54321 10.0.1.50:80 0.000 0.001 0.000 200 200 0 615 "INVALID REQUEST FORMAT" "Mozilla/5.0" - - arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "example.com" "-" 0 2023-12-01T10:30:45.122456Z "forward" "-" "-" "10.0.1.50:80" "200" "-" "-"',
  
  // Empty line (should be skipped)
  '',
  
  // Only whitespace (should be skipped)
  '   \t   '
];

export const mixedLogEntries = [
  ...validALBLogEntries.slice(0, 2),
  malformedLogEntries[0], // Missing fields
  validALBLogEntries[2],
  malformedLogEntries[1], // Invalid timestamp
  ...validALBLogEntries.slice(3),
  malformedLogEntries[2], // Invalid status code
];

export const createTestLogFile = (entries: string[], filePath: string): Promise<void> => {
  const fs = require('fs').promises;
  const content = entries.join('\n') + '\n';
  return fs.writeFile(filePath, content, 'utf8');
};

export const createCompressedTestLogFile = async (entries: string[], filePath: string): Promise<void> => {
  const fs = require('fs');
  const zlib = require('zlib');
  const { pipeline } = require('stream/promises');
  const { Readable } = require('stream');
  
  const content = entries.join('\n') + '\n';
  const readable = Readable.from([content]);
  const gzip = zlib.createGzip();
  const writeStream = fs.createWriteStream(filePath);
  
  await pipeline(readable, gzip, writeStream);
};

export const cleanupTestFiles = async (filePaths: string[]): Promise<void> => {
  const fs = require('fs').promises;
  
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  }
};