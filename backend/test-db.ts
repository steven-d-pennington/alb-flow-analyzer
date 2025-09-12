// YOLO test database connection and query
import { getDatabaseConfig } from './src/config/database';
import { ConnectionFactory } from './src/database/ConnectionFactory';

async function testDatabase() {
    console.log('=== YOLO DATABASE TEST ===');
    
    try {
        const config = getDatabaseConfig();
        console.log('Database config:', config);
        
        const factory = ConnectionFactory.getInstance();
        const pool = await factory.createPool(config);
        console.log('Pool created successfully');
        
        const connection = await pool.acquire();
        console.log('Connection acquired');
        
        // Check if log_entries table exists
        const tablesResult = await connection.query("SELECT name FROM sqlite_master WHERE type='table' AND name='log_entries'");
        console.log('log_entries table exists:', tablesResult.rows.length > 0);
        
        if (tablesResult.rows.length > 0) {
            // Count records
            const countResult = await connection.query('SELECT COUNT(*) as count FROM log_entries');
            console.log('Record count:', (countResult.rows[0] as any).count);
            
            // Show table schema
            const schemaResult = await connection.query('PRAGMA table_info(log_entries)');
            console.log('Table schema:');
            schemaResult.rows.forEach((col: any) => {
                console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''}`);
            });
            
            // Show sample records
            const sampleResult = await connection.query('SELECT * FROM log_entries LIMIT 3');
            console.log('Sample records:', sampleResult.rows.length);
            sampleResult.rows.forEach((row: any, i: number) => {
                console.log(`Record ${i + 1}:`, {
                    timestamp: row.timestamp,
                    client: row.client,
                    target: row.target,
                    elb_status_code: row.elb_status_code,
                    request: row.request?.substring(0, 100) + '...'
                });
            });
        }
        
        await pool.release(connection);
        console.log('Connection released');
        
    } catch (error) {
        console.error('Database error:', error);
    }
}

testDatabase().catch(console.error);