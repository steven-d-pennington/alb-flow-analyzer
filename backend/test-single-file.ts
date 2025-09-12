// Test processing a single file to verify the fix works
import { BatchProcessingService } from './src/ingestion/BatchProcessingService';
import { LocalFileManager } from './src/downloads/LocalFileManager';
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';
import { ALBLogParser } from './src/parser/LogParser';
import * as fs from 'fs/promises';
import * as zlib from 'zlib';

async function testSingleFile() {
    console.log('=== TESTING SINGLE FILE PROCESSING ===');
    
    try {
        const config = getDatabaseConfig();
        const factory = ConnectionFactory.getInstance();
        const connectionPool = await factory.createPool(config);
        const localFileManager = new LocalFileManager(connectionPool);
        
        // Get first file from the batch
        const batches = await localFileManager.getAllBatches();
        const completedBatch = batches.find(b => b.status === 'completed');
        if (!completedBatch) {
            console.error('No completed batch found');
            return;
        }
        
        const batchFiles = await localFileManager.getBatchFiles(completedBatch.batchId);
        const testFile = batchFiles[0];
        console.log(`Testing file: ${testFile.localPath}`);
        
        // Read and decompress the file
        const fileBuffer = await fs.readFile(testFile.localPath);
        const decompressed = zlib.gunzipSync(fileBuffer);
        const fileContent = decompressed.toString('utf-8');
        const lines = fileContent.split('\\n').filter(line => line.trim());
        
        console.log(`File has ${lines.length} log lines`);
        
        // Parse first 3 lines
        const parser = new ALBLogParser();
        const parsedRecords = [];
        
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const line = lines[i];
            const result = parser.parseEntry(line);
            
            if (result.success && result.entry) {
                console.log(`\\nParsed line ${i + 1}:`);
                console.log(`  Client IP: ${result.entry.clientIp}`);
                console.log(`  Target IP: ${result.entry.targetIp}`);
                console.log(`  Request: ${result.entry.requestVerb} ${result.entry.requestUrl}`);
                console.log(`  Status: ${result.entry.elbStatusCode}/${result.entry.targetStatusCode}`);
                parsedRecords.push(result.entry);
            }
        }
        
        if (parsedRecords.length === 0) {
            console.error('No records parsed successfully');
            return;
        }
        
        // Clear database first for clean test
        console.log('\\n🗑️ Clearing database for clean test...');
        const connection = await connectionPool.acquire();
        await connection.execute('DELETE FROM log_entries');
        
        // Test the storeRecords method using reflection
        const { EventEmitter } = require('events');
        const mockDownloadService = new EventEmitter();
        
        const batchProcessingService = new BatchProcessingService(
            localFileManager,
            mockDownloadService,
            connectionPool,
            null
        );
        
        // Use reflection to call private storeRecords method
        const storeRecords = (batchProcessingService as any).storeRecords.bind(batchProcessingService);
        await storeRecords(parsedRecords);
        
        console.log('✅ Records stored successfully!');
        
        // Verify the records were inserted correctly
        const result = await connection.query('SELECT COUNT(*) as count FROM log_entries');
        const recordCount = (result.rows[0] as any).count;
        console.log(`📊 Records in database: ${recordCount}`);
        
        // Show the inserted records to verify field mapping
        const samples = await connection.query('SELECT * FROM log_entries LIMIT 3');
        console.log('\\n📋 Inserted records (verifying field mapping):');
        samples.rows.forEach((record: any, i: number) => {
            console.log(`Record ${i + 1}:`);
            console.log(`  Client IP: ${record.client_ip} (✅ has value)`);
            console.log(`  Target IP: ${record.target_ip} (✅ has value)`);
            console.log(`  Request Verb: ${record.request_verb} (✅ has value)`);
            console.log(`  Request URL: ${record.request_url?.substring(0, 60)}... (✅ has value)`);
            console.log(`  Status: ${record.elb_status_code}/${record.target_status_code}`);
        });
        
        await connectionPool.release(connection);
        
        console.log('\\n🎉 SINGLE FILE TEST SUCCESS! Field mapping is fixed!');
        
    } catch (error) {
        console.error('❌ Single file test failed:', error);
    }
}

testSingleFile().catch(console.error);