// Process the full batch using the FIXED BatchProcessingService
import { BatchProcessingService } from './src/ingestion/BatchProcessingService';
import { LocalFileManager } from './src/downloads/LocalFileManager';
import { DownloadService } from './src/downloads/DownloadService';
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';

async function processFullBatch() {
    console.log('=== PROCESSING FULL BATCH WITH FIXED PIPELINE ===');
    
    try {
        const config = getDatabaseConfig();
        const factory = ConnectionFactory.getInstance();
        const connectionPool = await factory.createPool(config);
        
        const localFileManager = new LocalFileManager(connectionPool);
        
        // BatchProcessingService expects DownloadService to be an EventEmitter
        // Create a mock EventEmitter for this test
        const { EventEmitter } = require('events');
        const mockDownloadService = new EventEmitter();
        
        // Find the completed batch to process
        const batches = await localFileManager.getAllBatches();
        const completedBatch = batches.find(b => b.status === 'completed');
        
        if (!completedBatch) {
            console.error('❌ No completed batches found');
            return;
        }
        
        console.log(`✅ Found batch: ${completedBatch.batchId} with ${completedBatch.fileCount} files`);
        
        // Check current database count before processing
        const connection = await connectionPool.acquire();
        const beforeResult = await connection.query('SELECT COUNT(*) as count FROM log_entries');
        const beforeCount = (beforeResult.rows[0] as any).count;
        console.log(`📊 Records in database BEFORE processing: ${beforeCount}`);
        await connectionPool.release(connection);
        
        // Create BatchProcessingService with null WebSocket (no real-time updates needed for this test)
        const batchProcessingService = new BatchProcessingService(
            localFileManager,
            mockDownloadService,
            connectionPool,
            null // No WebSocket for this test
        );
        
        console.log(`🚀 Starting batch processing...`);
        const startTime = Date.now();
        
        // Process the batch
        const result = await batchProcessingService.processBatch({
            batchId: completedBatch.batchId,
            processImmediately: true,
            deleteAfterProcessing: false,
            forceReprocess: false
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`🎉 PROCESSING COMPLETED!`);
        console.log(`   Duration: ${duration}s`);
        console.log(`   Files processed: ${result.filesProcessed}`);
        console.log(`   Records processed: ${result.recordsProcessed}`);
        console.log(`   Errors: ${result.errors.length}`);
        
        if (result.errors.length > 0) {
            console.log(`❌ Errors encountered:`);
            result.errors.forEach((error, i) => {
                console.log(`   ${i + 1}. ${error}`);
            });
        }
        
        // Check final database count
        const connection2 = await connectionPool.acquire();
        const afterResult = await connection2.query('SELECT COUNT(*) as count FROM log_entries');
        const afterCount = (afterResult.rows[0] as any).count;
        console.log(`📊 Records in database AFTER processing: ${afterCount}`);
        console.log(`📈 New records added: ${afterCount - beforeCount}`);
        
        // Show some sample records to verify the fix
        const sampleResult = await connection2.query('SELECT * FROM log_entries LIMIT 5');
        console.log(`\n📋 Sample records from database:`);
        sampleResult.rows.forEach((record: any, i: number) => {
            console.log(`Record ${i + 1}:`);
            console.log(`   Timestamp: ${new Date(record.timestamp)}`);
            console.log(`   Client IP: ${record.client_ip}`); // Should now have real IPs
            console.log(`   Target IP: ${record.target_ip}`); // Should now have real IPs
            console.log(`   Request: ${record.request_verb} ${record.request_url}`); // Should now have real data
            console.log(`   Status: ${record.elb_status_code}/${record.target_status_code}`);
        });
        
        await connectionPool.release(connection2);
        
        console.log(`\n✅ FULL BATCH PROCESSING SUCCESS!`);
        
    } catch (error) {
        console.error('❌ PROCESSING FAILED:', error);
    }
}

processFullBatch().catch(console.error);