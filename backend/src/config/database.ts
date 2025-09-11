/**
 * Database configuration utility
 */

import * as path from 'path';
import { DatabaseConfig } from '../database/types';

/**
 * Get the database configuration with the correct path
 */
export function getDatabaseConfig(): DatabaseConfig {
  // Determine the correct database path based on current working directory
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