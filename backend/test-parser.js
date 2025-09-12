// Quick YOLO test script for ALB log parser
const { execSync } = require('child_process');

// Test ALB log line from the actual data
const testLine = 'h2 2025-07-10T16:14:49.506273Z app/prod-alb-crm-app-pub-01/f958bf738edcb8f5 172.68.245.30:55854 10.200.5.131:80 0.000 0.010 0.000 302 302 555 666 "POST https://crm.ecp123.com:443/app/vgc.cfm?CFID=undefined&CFTOKEN=undefined HTTP/2.0" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" TLS_AES_128_GCM_SHA256 TLSv1.3 arn:aws:elasticloadbalancing:us-east-1:291787221480:targetgroup/prod-tg-crm-app-pub-01/1836b7f493300494 "Root=1-686fe6f9-770025d140d81f056ce3f20b" "crm.ecp123.com" "arn:aws:acm:us-east-1:291787221480:certificate/cb226c92-5972-4ffc-abb5-c1b1f9690dde" 0 2025-07-10T16:14:49.495000Z "forward" "-" "-" "10.200.5.131:80" "302" "-" "-" TID_36251dde89acd044a08749c32d7f1d6f';

console.log('=== YOLO PARSER TEST ===');
console.log('Original line:');
console.log(testLine);
console.log('\nSplitting by spaces (ignoring quotes for now):');
const basicSplit = testLine.split(' ');
console.log('Field count:', basicSplit.length);
console.log('First 10 fields:', basicSplit.slice(0, 10));

console.log('\n=== MORE INTELLIGENT PARSING ===');
// Try to parse with quoted strings handled
function parseALBLine(line) {
    const fields = [];
    let currentField = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            insideQuotes = !insideQuotes;
            currentField += char;
        } else if (char === ' ' && !insideQuotes) {
            if (currentField.length > 0) {
                fields.push(currentField);
                currentField = '';
            }
        } else {
            currentField += char;
        }
    }
    
    // Add final field
    if (currentField.length > 0) {
        fields.push(currentField);
    }
    
    return fields;
}

const parsedFields = parseALBLine(testLine);
console.log('Parsed field count:', parsedFields.length);
parsedFields.forEach((field, index) => {
    console.log(`${index}: ${field}`);
});

console.log('\n=== EXPECTED ALB FIELDS ===');
const expectedFields = [
    'type', 'timestamp', 'elb', 'client:port', 'target:port', 'request_processing_time',
    'target_processing_time', 'response_processing_time', 'elb_status_code', 'target_status_code',
    'received_bytes', 'sent_bytes', 'request', 'user_agent', 'ssl_cipher', 'ssl_protocol',
    'target_group_arn', 'trace_id', 'domain_name', 'chosen_cert_arn', 'matched_rule_priority',
    'request_creation_time', 'actions_executed', 'redirect_url', 'lambda_error_reason',
    'target_port_list', 'target_status_code_list', 'classification', 'classification_reason', 
    'connection_id'
];

console.log('Expected fields:', expectedFields.length);
expectedFields.forEach((field, index) => {
    console.log(`${index}: ${field} = ${parsedFields[index] || 'MISSING'}`);
});