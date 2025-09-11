/**
 * Example usage of the database configuration and connection management system
 */

import { 
  connectionFactory, 
  DatabaseConfigBuilder, 
  createDefaultConfig,
  DatabaseConfig 
} from '../index';

async function demonstrateUsage() {
  console.log('=== Database Configuration and Connection Management Demo ===\n');

  // Example 1: Using the configuration builder
  console.log('1. Creating SQLite configuration using builder pattern:');
  const sqliteConfig = DatabaseConfigBuilder.create()
    .type('sqlite')
    .database('example.db')
    .maxConnections(5)
    .build();
  
  console.log('SQLite Config:', JSON.stringify(sqliteConfig, null, 2));

  // Example 2: Using default configurations
  console.log('\n2. Creating PostgreSQL configuration with defaults:');
  const postgresConfig = createDefaultConfig('postgresql', {
    host: 'localhost',
    database: 'alb_analyzer',
    username: 'user',
    password: 'password'
  });
  
  console.log('PostgreSQL Config:', JSON.stringify(postgresConfig, null, 2));

  // Example 3: Creating and using connection pools
  console.log('\n3. Creating connection pools and executing queries:');
  
  try {
    // Create SQLite pool
    const sqlitePool = await connectionFactory.createPool(sqliteConfig);
    console.log('SQLite pool created successfully');
    
    // Acquire connection and execute queries
    const connection = await sqlitePool.acquire();
    console.log('Connection acquired');
    
    // Create a test table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS test_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message TEXT NOT NULL
      )
    `);
    console.log('Test table created');
    
    // Insert test data
    await connection.execute(
      'INSERT INTO test_logs (message) VALUES (?)',
      ['Test log entry']
    );
    console.log('Test data inserted');
    
    // Query data
    const result = await connection.query(
      'SELECT * FROM test_logs WHERE message LIKE ?',
      ['%Test%']
    );
    console.log('Query result:', result.rows);
    console.log('Row count:', result.rowCount);
    
    // Release connection back to pool
    await sqlitePool.release(connection);
    console.log('Connection released');
    
    // Show pool statistics
    const stats = sqlitePool.getStats();
    console.log('Pool stats:', stats);
    
  } catch (error) {
    console.error('Error during database operations:', error);
  }

  // Example 4: Transaction handling
  console.log('\n4. Demonstrating transaction handling:');
  
  try {
    const memoryConfig: DatabaseConfig = {
      type: 'sqlite',
      database: ':memory:',
      maxConnections: 1
    };
    
    const memoryPool = await connectionFactory.createPool(memoryConfig);
    const txConnection = await memoryPool.acquire();
    
    // Create accounts table
    await txConnection.execute(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        balance DECIMAL(10,2) DEFAULT 0
      )
    `);
    
    // Insert initial data
    await txConnection.execute('INSERT INTO accounts (id, name, balance) VALUES (1, "Alice", 100.00)');
    await txConnection.execute('INSERT INTO accounts (id, name, balance) VALUES (2, "Bob", 50.00)');
    
    // Perform transaction
    await txConnection.beginTransaction();
    
    try {
      // Transfer $25 from Alice to Bob
      await txConnection.execute('UPDATE accounts SET balance = balance - 25 WHERE id = 1');
      await txConnection.execute('UPDATE accounts SET balance = balance + 25 WHERE id = 2');
      
      await txConnection.commit();
      console.log('Transaction committed successfully');
      
      // Verify results
      const balances = await txConnection.query('SELECT name, balance FROM accounts ORDER BY id');
      console.log('Final balances:', balances.rows);
      
    } catch (error) {
      await txConnection.rollback();
      console.error('Transaction rolled back due to error:', error);
    }
    
    await memoryPool.release(txConnection);
    await memoryPool.destroy();
    
  } catch (error) {
    console.error('Error during transaction demo:', error);
  }

  // Example 5: Multiple database types
  console.log('\n5. Supported database types:');
  const supportedTypes = connectionFactory.getSupportedTypes();
  console.log('Supported types:', supportedTypes);
  
  // Show default configurations for each type
  supportedTypes.forEach(type => {
    const defaultConfig = createDefaultConfig(type);
    console.log(`${type.toUpperCase()} defaults:`, JSON.stringify(defaultConfig, null, 2));
  });

  // Cleanup
  console.log('\n6. Cleaning up all connection pools:');
  await connectionFactory.closeAllPools();
  console.log('All pools closed');
  
  console.log('\n=== Demo completed ===');
}

// Export the demo function for use in other files
export { demonstrateUsage };

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateUsage().catch(console.error);
}