// YOLO test the full pipeline - parse and insert
import { ALBLogParser } from './src/parser/LogParser';
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';

const testLine = 'h2 2025-07-10T16:14:49.506273Z app/prod-alb-crm-app-pub-01/f958bf738edcb8f5 172.68.245.30:55854 10.200.5.131:80 0.000 0.010 0.000 302 302 555 666 "POST https://crm.ecp123.com:443/app/vgc.cfm?CFID=undefined&CFTOKEN=undefined HTTP/2.0" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" TLS_AES_128_GCM_SHA256 TLSv1.3 arn:aws:elasticloadbalancing:us-east-1:291787221480:targetgroup/prod-tg-crm-app-pub-01/1836b7f493300494 "Root=1-686fe6f9-770025d140d81f056ce3f20b" "crm.ecp123.com" "arn:aws:acm:us-east-1:291787221480:certificate/cb226c92-5972-4ffc-abb5-c1b1f9690dde" 0 2025-07-10T16:14:49.495000Z "forward" "-" "-" "10.200.5.131:80" "302" "-" "-" TID_36251dde89acd044a08749c32d7f1d6f';

async function testFullPipeline() {
    console.log('=== YOLO FULL PIPELINE TEST ===');
    
    // Parse the line
    const parser = new ALBLogParser();
    const parseResult = parser.parseEntry(testLine);
    
    if (!parseResult.success || !parseResult.entry) {
        console.error('❌ Parsing failed:', parseResult.error);
        return;
    }
    
    console.log('✅ Parsing successful');
    const record = parseResult.entry;
    
    // Show what fields we actually have
    console.log('\n=== PARSED RECORD FIELDS ===');
    Object.keys(record).forEach(key => {
        console.log(`${key}: ${JSON.stringify((record as any)[key])}`);
    });
    
    // Now test database insertion
    console.log('\n=== TESTING DATABASE INSERT ===');
    
    try {
        const config = getDatabaseConfig();
        const factory = ConnectionFactory.getInstance();
        const pool = await factory.createPool(config);
        const connection = await pool.acquire();
        
        // Try the CURRENT (broken) mapping
        console.log('\n--- Testing CURRENT mapping ---');
        try {
            const values = [
                record.timestamp,
                (record as any).client, // THIS WILL BE UNDEFINED!
                (record as any).target, // THIS WILL BE UNDEFINED!
                record.requestProcessingTime || 0,
                record.targetProcessingTime || 0,
                record.responseProcessingTime || 0,
                record.elbStatusCode || 0,
                record.targetStatusCode || 0,
                record.receivedBytes || 0,
                record.sentBytes || 0,
                (record as any).request || '', // THIS WILL BE EMPTY!
                record.userAgent || '',
                record.sslCipher || '',
                record.sslProtocol || '',
                record.targetGroupArn || '',
                record.traceId || '',
                record.domainName || '',
                record.chosenCertArn || '',
                record.matchedRulePriority || 0,
                record.requestCreationTime || '',
                record.actionsExecuted || '',
                record.redirectUrl || '',
                record.errorReason || '',
                record.targetPortList || '',
                record.targetStatusCodeList || '',
                record.classification || '',
                record.classificationReason || '',
                record.connectionId || ''
            ];
            
            console.log('Values being inserted:', values.slice(0, 5), '...');
            console.log('client field:', (record as any).client, '(SHOULD BE:', record.clientIp, ')');
            console.log('target field:', (record as any).target, '(SHOULD BE:', record.targetIp, ')');
            
        } catch (error) {
            console.error('Current mapping failed as expected:', error);
        }
        
        // Try CORRECTED mapping
        console.log('\n--- Testing CORRECTED mapping ---');
        const correctedQuery = `
          INSERT INTO log_entries (
            timestamp, client_ip, target_ip, request_processing_time, target_processing_time,
            response_processing_time, elb_status_code, target_status_code, received_bytes,
            sent_bytes, request_verb, request_url, request_protocol, user_agent, ssl_cipher, ssl_protocol, target_group_arn,
            trace_id, domain_name, chosen_cert_arn, matched_rule_priority,
            request_creation_time, actions_executed, redirect_url, error_reason,
            target_port_list, target_status_code_list, classification,
            classification_reason, connection_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const correctedValues = [
            record.timestamp,
            record.clientIp, // CORRECT!
            record.targetIp, // CORRECT!
            record.requestProcessingTime || 0,
            record.targetProcessingTime || 0,
            record.responseProcessingTime || 0,
            record.elbStatusCode || 0,
            record.targetStatusCode || 0,
            record.receivedBytes || 0,
            record.sentBytes || 0,
            record.requestVerb || '', // CORRECT!
            record.requestUrl || '', // CORRECT!
            record.requestProtocol || '', // CORRECT!
            record.userAgent || '',
            record.sslCipher || '',
            record.sslProtocol || '',
            record.targetGroupArn || '',
            record.traceId || '',
            record.domainName || '',
            record.chosenCertArn || '',
            record.matchedRulePriority || 0,
            record.requestCreationTime || '',
            record.actionsExecuted || '',
            record.redirectUrl || '',
            record.errorReason || '',
            record.targetPortList || '',
            record.targetStatusCodeList || '',
            record.classification || '',
            record.classificationReason || '',
            record.connectionId || ''
        ];
        
        console.log('Corrected values:', correctedValues.slice(0, 5), '...');
        
        await connection.execute(correctedQuery, correctedValues);
        console.log('✅ CORRECTED insertion successful!');
        
        // Verify it was inserted
        const result = await connection.query('SELECT COUNT(*) as count FROM log_entries');
        console.log('Records in database after insert:', (result.rows[0] as any).count);
        
        await pool.release(connection);
        
    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

testFullPipeline().catch(console.error);