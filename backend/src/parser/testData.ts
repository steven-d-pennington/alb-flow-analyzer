// Test data for ALB log parser tests

export const validLogEntries = [
  // Standard ALB access log entry
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
  
  // Entry with SSL termination
  `https 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.086 0.048 0.037 200 200 0 57 "GET https://www.example.com:443/index.html HTTP/1.1" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337281-1d84f3d73c47ec4e58577259" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 1 2018-07-02T22:23:00.186000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
  
  // Entry with error status
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 - 0.000 0.000 0.000 502 - 34 0 "GET http://www.example.com:80/health HTTP/1.1" "ELB-HealthChecker/2.0" - - arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "-" 0 2018-07-02T22:22:58.364000Z "forward" "-" "TargetNotFound" "-" "-" "-" "-"`,
  
  // Entry with redirect
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 - 0.000 0.000 0.000 301 - 34 366 "GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "-" 0 2018-07-02T22:22:58.364000Z "redirect" "https://www.example.com:443/" "-" "-" "-" "-" "-"`,
  
  // Entry with POST request and body
  `https 2018-07-02T22:23:00.186641Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.001 0.002 0.000 200 200 512 1024 "POST https://api.example.com:443/users HTTP/1.1" "MyApp/1.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337281-1d84f3d73c47ec4e58577259" "api.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 1 2018-07-02T22:23:00.186000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`
];

export const malformedLogEntries = [
  // Empty line
  '',
  
  // Too few fields
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188`,
  
  // Invalid timestamp
  `http invalid-timestamp app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
  
  // Invalid status code
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 invalid 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
  
  // Invalid request format
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "INVALID REQUEST FORMAT" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`
];

export const edgeCaseLogEntries = [
  // IPv6 addresses
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 [2001:db8::1]:2817 [2001:db8::2]:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "[2001:db8::2]:80" "200" "-" "-"`,
  
  // Very long URL
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/very/long/path/with/many/segments/and/query/parameters?param1=value1&param2=value2&param3=value3&param4=value4&param5=value5 HTTP/1.1" "curl/7.46.0" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`,
  
  // Special characters in user agent
  `http 2018-07-02T22:22:58.364000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.131.39:2817 10.0.0.1:80 0.000 0.001 0.000 200 200 34 366 "GET https://www.example.com:443/ HTTP/1.1" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" ECDHE-RSA-AES128-GCM-SHA256 TLSv1.2 arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "www.example.com" "arn:aws:acm:us-east-2:123456789012:certificate/12345678-1234-1234-1234-123456789012" 0 2018-07-02T22:22:58.364000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"`
];