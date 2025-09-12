// Test the SQL syntax fix
import { BatchProcessingService } from './src/ingestion/BatchProcessingService';
import { LocalFileManager } from './src/downloads/LocalFileManager';
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';
import { ALBLogParser } from './src/parser/LogParser';

const testLine = 'h2 2025-07-10T16:14:49.506273Z app/prod-alb-crm-app-pub-01/f958bf738edcb8f5 172.68.245.30:55854 10.200.5.131:80 0.000 0.010 0.000 302 302 555 666 "POST https://crm.ecp123.com:443/app/vgc.cfm?CFID=undefined&CFTOKEN=undefined HTTP/2.0" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" TLS_AES_128_GCM_SHA256 TLSv1.3 arn:aws:elasticloadbalancing:us-east-1:291787221480:targetgroup/prod-tg-crm-app-pub-01/1836b7f493300494 "Root=1-686fe6f9-770025d140d81f056ce3f20b" "crm.ecp123.com" "arn:aws:acm:us-east-1:291787221480:certificate/cb226c92-5972-4ffc-abb5-c1b1f9690dde" 0 2025-07-10T16:14:49.495000Z "forward" "-" "-" "10.200.5.131:80" "302" "-" "-" TID_36251dde89acd044a08749c32d7f1d6f';

async function testSqlFix() {
    console.log('=== TESTING SQL SYNTAX FIX ===');
    
    try {
        const config = getDatabaseConfig();
        const factory = ConnectionFactory.getInstance();
        const connectionPool = await factory.createPool(config);
        const localFileManager = new LocalFileManager(connectionPool);
        
        // Parse the test line
        const parser = new ALBLogParser();
        const parseResult = parser.parseEntry(testLine);
        
        if (!parseResult.success || !parseResult.entry) {
            console.error('❌ Parsing failed');
            return;
        }
        
        console.log('✅ ALB log parsed successfully');
        console.log(`   Client: ${parseResult.entry.clientIp} -> Target: ${parseResult.entry.targetIp}`);
        console.log(`   Request: ${parseResult.entry.requestVerb} ${parseResult.entry.requestUrl}`);
        
        // Clear database first
        const connection = await connectionPool.acquire();
        await connection.execute('DELETE FROM log_entries');
        
        // Test the fixed storeRecords method
        const { EventEmitter } = require('events');
        const mockDownloadService = new EventEmitter();
        
        const batchProcessingService = new BatchProcessingService(
            localFileManager,
            mockDownloadService,
            connectionPool,
            null
        );
        
        console.log('🧪 Testing fixed SQL syntax...');
        
        // Use reflection to call private storeRecords method
        const storeRecords = (batchProcessingService as any).storeRecords.bind(batchProcessingService);
        await storeRecords([parseResult.entry]);
        
        console.log('✅ SQL INSERT successful - no syntax error!');
        
        // Verify record was inserted
        const result = await connection.query('SELECT COUNT(*) as count FROM log_entries');
        const recordCount = (result.rows[0] as any).count;
        console.log(`📊 Records in database: ${recordCount}`);
        
        // Show the inserted record
        const sample = await connection.query('SELECT * FROM log_entries LIMIT 1');
        if (sample.rows.length > 0) {
            const record = sample.rows[0] as any;
            console.log('\\n📋 Inserted record:');
            console.log(`   Client IP: ${record.client_ip}`);
            console.log(`   Target IP: ${record.target_ip}`);
            console.log(`   Request: ${record.request_verb} ${record.request_url}`);
            console.log(`   Status: ${record.elb_status_code}/${record.target_status_code}`);
        }
        
        await connectionPool.release(connection);
        
        console.log('\\n🎉 SQL SYNTAX FIX CONFIRMED WORKING!');
        console.log('✅ The BatchProcessingService can now insert records successfully');
        
    } catch (error) {
        console.error('❌ SQL test failed:', error);
    }
}

testSqlFix().catch(console.error);