#!/usr/bin/env node

/**
 * Database setup script
 * This script initializes the database and runs all migrations
 */

import { ConnectionFactory } from './ConnectionFactory';
import { MigrationRunner } from './migrations/MigrationRunner';
import { allMigrations } from './migrations';
import { DatabaseConfig } from './types';
import * as path from 'path';
import * as fs from 'fs';

async function setupDatabase() {
  try {
    console.log('🚀 Starting database setup...');

    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }

    // Database configuration
    const config: DatabaseConfig = {
      type: 'sqlite',
      database: process.env.DATABASE_PATH || './data/alb_logs.db',
      maxConnections: 10
    };

    console.log('📊 Database config:', config);

    // Create connection factory and pool
    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    console.log('🔗 Database connection pool created');

    // Get a connection for migrations
    const connection = await connectionPool.acquire();
    console.log('🔌 Database connection established');

    // Create migration runner and run migrations
    const migrationRunner = new MigrationRunner(connection);
    migrationRunner.addMigrations(allMigrations);

    console.log('🔄 Running database migrations...');
    await migrationRunner.runMigrations();

    // Release connection
    await connectionPool.release(connection);
    console.log('✅ Database setup completed successfully!');

    // Close the connection pool
    await connectionPool.destroy();
    process.exit(0);

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  setupDatabase();
}

export { setupDatabase };