/**
 * Database configuration utility
 */

import * as path from 'path';
import { DatabaseConfig, DatabaseType } from '../database/types';

/**
 * Get the database configuration with the correct path
 */
export function getDatabaseConfig(): DatabaseConfig {
  const dbType = (process.env.DATABASE_TYPE || 'sqlite') as DatabaseType;
  
  if (dbType === 'postgresql') {
    if (process.env.DATABASE_URL) {
      // Use connection string if provided
      return {
        type: 'postgresql',
        connectionString: process.env.DATABASE_URL,
        maxConnections: parseInt(process.env.MAX_CONNECTIONS || '20')
      };
    } else {
      // Use individual connection parameters
      return {
        type: 'postgresql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'alb_logs',
        username: process.env.DB_USER || 'alb_user',
        password: process.env.DB_PASSWORD || 'alb_password',
        maxConnections: parseInt(process.env.MAX_CONNECTIONS || '20')
      };
    }
  }
  
  // SQLite configuration (fallback)
  let databasePath: string;
  
  if (process.cwd().endsWith('backend')) {
    // Running from backend directory
    databasePath = './data/alb_logs.db';
  } else {
    // Running from project root
    databasePath = './backend/data/alb_logs.db';
  }
  
  // Allow environment override
  if (process.env.DATABASE_PATH) {
    databasePath = process.env.DATABASE_PATH;
  }
  
  console.log('Database path resolved to:', path.resolve(databasePath));
  
  return {
    type: 'sqlite',
    database: databasePath,
    maxConnections: 10
  };
}