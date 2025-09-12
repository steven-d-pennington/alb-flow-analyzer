#!/usr/bin/env ts-node

/**
 * Run database migrations for PostgreSQL setup
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { ConnectionFactory } from './src/database/ConnectionFactory';
import { getDatabaseConfig } from './src/config/database';
import { MigrationRunner, allMigrations } from './src/database/migrations';

async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  
  try {
    // Get database configuration
    const config = getDatabaseConfig();
    console.log(`📋 Database type: ${config.type}`);
    console.log(`🔗 Connection: ${config.connectionString || `${config.host}:${config.port}/${config.database}`}`);
    
    // Create connection factory and pool
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    
    // Get a connection for migrations
    const connection = await connectionPool.acquire();
    
    try {
      // Create migration runner
      const migrationRunner = new MigrationRunner(connection);
      
      // Add all migrations
      migrationRunner.addMigrations(allMigrations);
      
      // Create migrations table first
      console.log('📝 Creating migrations tracking table...');
      await migrationRunner.createMigrationsTable();
      
      // Run all migrations
      console.log('⚡ Running migrations...');
      await migrationRunner.runMigrations();
      
      console.log('\n🎉 All migrations completed successfully!');
      console.log('🔥 Your PostgreSQL database is ready for optimized processing!');
      
    } finally {
      // Release connection
      await connectionPool.release(connection);
    }
    
    // Close connection pool
    await factory.closeAllPools();
    
  } catch (error) {
    console.error('💥 Migration failed:', error instanceof Error ? error.message : error);
    console.error('\n🔧 Troubleshooting:');
    console.error('  1. Make sure PostgreSQL is running: docker ps');
    console.error('  2. Check DATABASE_URL in .env file');
    console.error('  3. Verify PostgreSQL connection: docker exec alb-postgres psql -U alb_user -d alb_logs -c "SELECT 1;"');
    process.exit(1);
  }
}

// Run migrations
runMigrations();