#!/usr/bin/env node

/**
 * Script to check database contents and structure
 */

import { ConnectionFactory } from '../database/ConnectionFactory';
import { DatabaseConfig } from '../database/types';

async function checkDatabase() {
  try {
    console.log('🔍 Checking database...');

    const config: DatabaseConfig = {
      type: 'sqlite',
      database: './data/alb_analyzer.db',
      maxConnections: 10
    };

    const factory = ConnectionFactory.getInstance();
    const connectionPool = await factory.createPool(config);
    const connection = await connectionPool.acquire();

    console.log('🔗 Connected to database');

    // Check if migrations table exists
    try {
      const migrationsResult = await connection.query('SELECT * FROM migrations');
      console.log('📋 Migrations table exists with', migrationsResult.rows.length, 'entries:');
      migrationsResult.rows.forEach(row => {
        console.log('  -', row);
      });
    } catch (error) {
      console.log('❌ Migrations table does not exist');
    }

    // Check if log_entries table exists
    try {
      const logEntriesResult = await connection.query('SELECT COUNT(*) as count FROM log_entries');
      console.log('📊 log_entries table exists with', logEntriesResult.rows[0].count, 'entries');
    } catch (error) {
      console.log('❌ log_entries table does not exist');
    }

    // List all tables
    try {
      const tablesResult = await connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);
      console.log('📋 All tables in database:');
      tablesResult.rows.forEach(row => {
        console.log('  -', row.name);
      });
    } catch (error) {
      console.log('❌ Could not list tables:', error);
    }

    await connectionPool.release(connection);
    await connectionPool.destroy();

  } catch (error) {
    console.error('❌ Database check failed:', error);
  }
}

if (require.main === module) {
  checkDatabase();
}

export { checkDatabase };