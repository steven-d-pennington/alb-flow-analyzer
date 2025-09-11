#!/usr/bin/env node

/**
 * Script to process the sample log file and populate the database
 */

import * as path from 'path';
import * as fs from 'fs';
import { ALBLogIngestion } from '../ingestion/LogIngestion';
import { ConnectionFactory } from '../database/ConnectionFactory';
import { createDataStore } from '../database/DataStore';
import { DatabaseConfig } from '../database/types';

async function processSampleLog() {
  try {
    console.log('🚀 Starting sample log processing...');

    // Find the sample log file (in the project root)
    const sampleLogPath = path.join(process.cwd(), '..', '291787221480_elasticloadbalancing_us-east-1_app.prod-alb-crm-app-pub-01.f958bf738edcb8f5_20250801T0025Z_3.225.170.1_2szz36nb.log.gz');
    
    if (!fs.existsSync(sampleLogPath)) {
      console.error('❌ Sample log file not found at:', sampleLogPath);
      process.exit(1);
    }

    console.log('📄 Found sample log file:', sampleLogPath);

    // Database configuration
    const config: DatabaseConfig = {
      type: 'sqlite',
      database: './data/alb_logs.db',
      maxConnections: 10
    };

    // Create connection factory and data store
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const dataStore = await createDataStore(connectionPool);
    console.log('🔗 Database connection established');

    // Create log ingestion service
    const logIngestion = new ALBLogIngestion();

    // Process the sample log file
    console.log('📊 Processing log file...');
    const result = await logIngestion.loadLocalFiles([sampleLogPath], {
      batchSize: 1000,
      skipMalformedLines: true,
      progressCallback: (progress) => {
        console.log(`📊 Progress: ${progress.processedFiles}/${progress.totalFiles} files, ${progress.processedLines} lines processed`);
      }
    });

    console.log('✅ Log processing completed!');
    console.log(`📈 Processed ${result.totalLines} log entries`);
    console.log(`✅ Successfully parsed: ${result.successfullyParsed} entries`);
    console.log(`⚠️  Failed lines: ${result.failedLines}`);
    console.log(`⏱️  Processing time: ${result.processingTime}ms`);

    // Now we need to store the parsed entries in the database
    if (result.entries && result.entries.length > 0) {
      console.log('💾 Storing entries in database...');
      
      const storeResult = await dataStore.store(result.entries);
      
      console.log(`💾 Stored ${storeResult.insertedCount} entries in database`);
      if (storeResult.failedCount > 0) {
        console.warn(`⚠️  Failed to store ${storeResult.failedCount} entries`);
        storeResult.errors.forEach(error => console.error('  -', error));
      }
    }

    // Close the connection pool
    await connectionPool.destroy();
    console.log('🔚 Database connection closed');

  } catch (error) {
    console.error('❌ Log processing failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run processing if this script is executed directly
if (require.main === module) {
  processSampleLog();
}

export { processSampleLog };