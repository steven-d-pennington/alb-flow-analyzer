// YOLO test for TypeScript ALB parser
import { ALBLogParser } from './src/parser/LogParser';

const testLine = 'h2 2025-07-10T16:14:49.506273Z app/prod-alb-crm-app-pub-01/f958bf738edcb8f5 172.68.245.30:55854 10.200.5.131:80 0.000 0.010 0.000 302 302 555 666 "POST https://crm.ecp123.com:443/app/vgc.cfm?CFID=undefined&CFTOKEN=undefined HTTP/2.0" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" TLS_AES_128_GCM_SHA256 TLSv1.3 arn:aws:elasticloadbalancing:us-east-1:291787221480:targetgroup/prod-tg-crm-app-pub-01/1836b7f493300494 "Root=1-686fe6f9-770025d140d81f056ce3f20b" "crm.ecp123.com" "arn:aws:acm:us-east-1:291787221480:certificate/cb226c92-5972-4ffc-abb5-c1b1f9690dde" 0 2025-07-10T16:14:49.495000Z "forward" "-" "-" "10.200.5.131:80" "302" "-" "-" TID_36251dde89acd044a08749c32d7f1d6f';

console.log('=== YOLO TYPESCRIPT PARSER TEST ===');

const parser = new ALBLogParser();
const result = parser.parseEntry(testLine);

console.log('Parse result:', JSON.stringify(result, null, 2));

if (result.success && result.entry) {
    console.log('\n=== PARSED ENTRY ===');
    console.log('Timestamp:', result.entry.timestamp);
    console.log('Client IP:', result.entry.clientIp);
    console.log('Target IP:', result.entry.targetIp);
    console.log('Request URL:', result.entry.requestUrl);
    console.log('Request Verb:', result.entry.requestVerb);
    console.log('Status codes:', result.entry.elbStatusCode, '/', result.entry.targetStatusCode);
    console.log('User Agent:', result.entry.userAgent);
}