// Completely clear the ALB logs database
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';
import * as fs from 'fs/promises';
import * as path from 'path';

async function clearDatabase() {
    console.log('=== CLEARING ALB LOGS DATABASE ===');
    
    try {
        const config = getDatabaseConfig();
        console.log('Database path:', config.database);
        
        // Method 1: Try to delete all data via SQL
        console.log('1. Attempting to clear via SQL...');
        try {
            const factory = ConnectionFactory.getInstance();
            const pool = await factory.createPool(config);
            const connection = await pool.acquire();
            
            // Check current record count
            const beforeResult = await connection.query('SELECT COUNT(*) as count FROM log_entries');
            const beforeCount = (beforeResult.rows[0] as any).count;
            console.log(`   Records before clearing: ${beforeCount}`);
            
            // Delete all records
            await connection.execute('DELETE FROM log_entries');
            
            // Check after deletion
            const afterResult = await connection.query('SELECT COUNT(*) as count FROM log_entries');
            const afterCount = (afterResult.rows[0] as any).count;
            console.log(`   Records after DELETE: ${afterCount}`);
            
            // VACUUM to reclaim space
            console.log('   Running VACUUM to reclaim disk space...');
            await connection.execute('VACUUM');
            
            await pool.release(connection);
            console.log('✅ SQL clearing completed');
            
        } catch (error) {
            console.error('❌ SQL clearing failed:', error);
        }
        
        // Check file size after SQL operations
        const dbPath = path.resolve(config.database || './data/alb_logs.db');
        try {
            const stats = await fs.stat(dbPath);
            const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
            console.log(`Database file size after SQL operations: ${sizeGB} GB`);
            
            if (stats.size > 100 * 1024 * 1024) { // Still > 100MB
                console.log('\\n2. Database still large, attempting file deletion...');
                
                // Method 2: Delete the actual file
                await fs.unlink(dbPath);
                console.log('✅ Database file deleted completely');
                
                // The database will be recreated on next connection with migrations
                console.log('   Database will be recreated automatically on next use');
            }
            
        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                console.log('✅ Database file does not exist (already cleared)');
            } else {
                console.error('Error checking/deleting database file:', error);
            }
        }
        
        console.log('\\n🎉 Database clearing completed!');
        
    } catch (error) {
        console.error('❌ Database clearing failed:', error);
    }
}

clearDatabase().catch(console.error);