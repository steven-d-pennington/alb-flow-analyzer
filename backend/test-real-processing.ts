// YOLO test processing real downloaded ALB logs
import { BatchProcessingService } from './src/ingestion/BatchProcessingService';
import { LocalFileManager } from './src/downloads/LocalFileManager';
import { DownloadService } from './src/downloads/DownloadService';
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';
import { ALBLogParser } from './src/parser/LogParser';
import * as zlib from 'zlib';
import * as fs from 'fs/promises';

async function testRealProcessing() {
    console.log('=== YOLO REAL FILE PROCESSING TEST ===');
    
    try {
        const config = getDatabaseConfig();
        const factory = ConnectionFactory.getInstance();
        const connectionPool = await factory.createPool(config);
        
        const localFileManager = new LocalFileManager(connectionPool);
        
        // Find the first downloaded batch
        const batches = await localFileManager.getAllBatches();
        console.log(`Found ${batches.length} batches`);
        
        const completedBatch = batches.find(b => b.status === 'completed');
        if (!completedBatch) {
            console.error('❌ No completed batches found');
            return;
        }
        
        console.log(`✅ Found completed batch: ${completedBatch.batchId}`);
        console.log(`Files in batch: ${completedBatch.fileCount}`);
        
        // Get the files for this batch
        const batchFiles = await localFileManager.getBatchFiles(completedBatch.batchId);
        console.log(`Got ${batchFiles.length} file paths`);
        
        if (batchFiles.length === 0) {
            console.error('❌ No files found for batch');
            return;
        }
        
        // Process just the FIRST file to test
        const testFile = batchFiles[0];
        console.log(`\n📁 Processing test file: ${testFile.localPath}`);
        
        // Check if file exists
        try {
            const stats = await fs.stat(testFile.localPath);
            console.log(`File size: ${stats.size} bytes`);
        } catch (error) {
            console.error('❌ File does not exist:', testFile.localPath);
            return;
        }
        
        // Read and decompress file content
        console.log('📖 Reading file...');
        const fileName = testFile.localPath.split('/').pop() || '';
        let fileContent: string;
        
        if (fileName.endsWith('.gz') || fileName.endsWith('.gzip')) {
            console.log('🔧 Decompressing gzipped file...');
            const fileBuffer = await fs.readFile(testFile.localPath);
            const decompressed = zlib.gunzipSync(fileBuffer);
            fileContent = decompressed.toString('utf-8');
        } else {
            fileContent = await fs.readFile(testFile.localPath, 'utf-8');
        }
        
        const lines = fileContent.split('\\n').filter(line => line.trim());
        console.log(`📊 Found ${lines.length} log lines`);
        
        if (lines.length === 0) {
            console.error('❌ No log lines found in file');
            return;
        }
        
        // Test parsing first few lines
        console.log('\\n🔍 Testing parser on first 3 lines...');
        const parser = new ALBLogParser();
        const parsedRecords = [];
        
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const line = lines[i];
            console.log(`\\nLine ${i + 1}: ${line.substring(0, 100)}...`);
            
            try {
                const result = parser.parseEntry(line);
                if (result.success && result.entry) {
                    console.log(`✅ Parsed successfully`);
                    console.log(`   Client: ${result.entry.clientIp} -> Target: ${result.entry.targetIp}`);
                    console.log(`   Request: ${result.entry.requestVerb} ${result.entry.requestUrl}`);
                    console.log(`   Status: ${result.entry.elbStatusCode}/${result.entry.targetStatusCode}`);
                    parsedRecords.push(result.entry);
                } else {
                    console.log(`❌ Parse failed: ${result.error}`);
                }
            } catch (error) {
                console.log(`❌ Parse error: ${error}`);
            }
        }
        
        if (parsedRecords.length === 0) {
            console.error('❌ No records successfully parsed');
            return;
        }
        
        console.log(`\\n💾 Testing database insertion of ${parsedRecords.length} records...`);
        
        // Test the fixed storeRecords method
        const batchProcessingService = new BatchProcessingService(
            localFileManager,
            {} as any, // DownloadService not needed for this test
            connectionPool,
            null // WebSocket not needed
        );
        
        // Use reflection to call the private method (YOLO!)
        const storeRecords = (batchProcessingService as any).storeRecords.bind(batchProcessingService);
        await storeRecords(parsedRecords);
        
        console.log('✅ Database insertion successful!');
        
        // Verify records were inserted
        const connection = await connectionPool.acquire();
        const result = await connection.query('SELECT COUNT(*) as count FROM log_entries');
        const recordCount = (result.rows[0] as any).count;
        console.log(`📊 Total records in database: ${recordCount}`);
        
        // Show a sample record
        const sampleResult = await connection.query('SELECT * FROM log_entries LIMIT 1');
        if (sampleResult.rows.length > 0) {
            const sample = sampleResult.rows[0] as any;
            console.log('\\n📋 Sample database record:');
            console.log(`   Timestamp: ${sample.timestamp}`);
            console.log(`   Client IP: ${sample.client_ip}`);
            console.log(`   Target IP: ${sample.target_ip}`);
            console.log(`   Request: ${sample.request_verb} ${sample.request_url}`);
            console.log(`   Status: ${sample.elb_status_code}/${sample.target_status_code}`);
        }
        
        await connectionPool.release(connection);
        console.log('\\n🎉 YOLO SUCCESS! Processing pipeline is now working!');
        
    } catch (error) {
        console.error('❌ YOLO FAILED:', error);
    }
}

testRealProcessing().catch(console.error);