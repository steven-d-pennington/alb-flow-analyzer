#!/usr/bin/env ts-node

/**
 * Standalone script to run the metrics tables migration
 * This bypasses the server compilation issues and directly executes the migration
 */

import dotenv from 'dotenv';

// Load environment variables from .env and .env.local
const envLocalResult = dotenv.config({ path: './.env.local', override: true });
const envResult = dotenv.config({ path: './.env' });

console.log('📁 Loading environment variables...');
if (envLocalResult.error) {
  console.log('⚠️  .env.local not found or error:', envLocalResult.error.message);
} else {
  console.log('✅ .env.local loaded successfully');
}
if (envResult.error) {
  console.log('⚠️  .env not found or error:', envResult.error.message);
} else {
  console.log('✅ .env loaded successfully');
}

import { ConnectionFactory } from './src/database/ConnectionFactory';
import { getDatabaseConfig } from './src/config/database';
import { MigrationRunner } from './src/database/migrations/MigrationRunner';
import { createMetricsTablesMigration } from './src/database/migrations/007_create_metrics_tables';

async function runMetricsMigration() {
    let connection = null;
    try {
        console.log('🚀 Starting metrics migration...');
        
        const config = getDatabaseConfig();
        console.log('📍 Database config:', config);
        
        const factory = ConnectionFactory.getInstance();
        const connectionPool = await factory.createPool(config);
        
        // Get a single connection from the pool for migrations
        connection = await connectionPool.acquire();
        console.log('✅ Database connection acquired');
        
        const migrationRunner = new MigrationRunner(connection);
        
        // Add the metrics migration
        migrationRunner.addMigration(createMetricsTablesMigration);
        console.log('📝 Migration registered:', createMetricsTablesMigration.name);
        
        const executedMigrations = await migrationRunner.runMigrations();
        
        console.log('🎉 Migration completed successfully!');
        console.log(`📊 Migrations executed: ${executedMigrations.length}`);
        
        if (executedMigrations.length > 0) {
            console.log('📋 Migration details:');
            executedMigrations.forEach(migration => {
                console.log(`  - ${migration.name} (${migration.id}) at ${migration.executed_at}`);
            });
        } else {
            console.log('ℹ️  No new migrations to run (already up to date)');
        }
        
        // Release the connection back to the pool
        if (connection) {
            await connectionPool.release(connection);
            console.log('🔌 Database connection released');
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        
        if (connection) {
            try {
                const config = getDatabaseConfig();
                const factory = ConnectionFactory.getInstance();
                const connectionPool = await factory.createPool(config);
                await connectionPool.release(connection);
                console.log('🔌 Database connection released (cleanup)');
            } catch (releaseError) {
                console.error('⚠️  Error releasing connection:', releaseError);
            }
        }
        
        process.exit(1);
    }
}

// Check if this script is being run directly
if (require.main === module) {
    runMetricsMigration();
}