/**
 * Unit tests for SQLite adapter
 */

import { SqliteConnectionPool, SqliteConnection } from '../adapters/SqliteAdapter';
import { DatabaseConfig } from '../types';

describe('SqliteAdapter', () => {
  let pool: SqliteConnectionPool;
  let config: DatabaseConfig;

  beforeEach(() => {
    config = {
      type: 'sqlite',
      database: ':memory:',
      maxConnections: 5
    };
    pool = new SqliteConnectionPool(config);
  });

  afterEach(async () => {
    await pool.destroy();
  });

  describe('SqliteConnectionPool', () => {
    it('should create pool with correct configuration', () => {
      expect(pool).toBeDefined();
      expect(pool.getStats().totalConnections).toBe(0);
    });

    it('should acquire connection', async () => {
      const connection = await pool.acquire();
      expect(connection).toBeDefined();
      expect(connection.isConnected()).toBe(true);
      expect(pool.getStats().totalConnections).toBe(1);
      expect(pool.getStats().activeConnections).toBe(1);
    });

    it('should release connection', async () => {
      const connection = await pool.acquire();
      await pool.release(connection);
      
      expect(pool.getStats().activeConnections).toBe(0);
      expect(pool.getStats().idleConnections).toBe(1);
    });

    it('should reuse released connections', async () => {
      const connection1 = await pool.acquire();
      await pool.release(connection1);
      
      const connection2 = await pool.acquire();
      expect(connection2).toBe(connection1);
      expect(pool.getStats().totalConnections).toBe(1);
    });

    it('should respect max connections limit', async () => {
      const connections = [];
      
      // Acquire max connections
      for (let i = 0; i < 5; i++) {
        connections.push(await pool.acquire());
      }
      
      expect(pool.getStats().totalConnections).toBe(5);
      expect(pool.getStats().activeConnections).toBe(5);
      
      // Try to acquire one more - should wait
      const acquirePromise = pool.acquire();
      
      // Release one connection
      await pool.release(connections[0]);
      
      // Now the waiting acquire should complete
      const connection = await acquirePromise;
      expect(connection).toBeDefined();
    });

    it('should handle pool destruction', async () => {
      const connection = await pool.acquire();
      await pool.destroy();
      
      expect(pool.getStats().totalConnections).toBe(0);
      await expect(pool.acquire()).rejects.toThrow('Connection pool has been destroyed');
    });

    it('should provide accurate stats', async () => {
      const connection1 = await pool.acquire();
      const connection2 = await pool.acquire();
      
      expect(pool.getStats()).toEqual({
        totalConnections: 2,
        activeConnections: 2,
        idleConnections: 0,
        waitingClients: 0
      });
      
      await pool.release(connection1);
      
      expect(pool.getStats()).toEqual({
        totalConnections: 2,
        activeConnections: 1,
        idleConnections: 1,
        waitingClients: 0
      });
    });
  });

  describe('SqliteConnection', () => {
    let connection: SqliteConnection;
    let testPool: SqliteConnectionPool;

    beforeEach(async () => {
      // Create a fresh pool for each test to avoid transaction conflicts
      const testConfig: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        maxConnections: 1
      };
      testPool = new SqliteConnectionPool(testConfig);
      connection = (await testPool.acquire()) as SqliteConnection;
    });

    afterEach(async () => {
      await testPool.release(connection);
      await testPool.destroy();
    });

    it('should execute CREATE TABLE statement', async () => {
      const sql = `
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      const result = await connection.execute(sql);
      expect(result.affectedRows).toBe(0); // CREATE TABLE doesn't affect rows
    });

    it('should insert and query data', async () => {
      // Create table
      await connection.execute(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `);
      
      // Insert data
      const insertResult = await connection.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['John Doe', 'john@example.com']
      );
      
      expect(insertResult.affectedRows).toBe(1);
      expect(insertResult.insertId).toBeDefined();
      
      // Query data
      const queryResult = await connection.query(
        'SELECT * FROM users WHERE name = ?',
        ['John Doe']
      );
      
      expect(queryResult.rows).toHaveLength(1);
      expect(queryResult.rows[0]).toMatchObject({
        name: 'John Doe',
        email: 'john@example.com'
      });
      expect(queryResult.fields).toBeDefined();
      expect(queryResult.fields!.length).toBeGreaterThan(0);
    });

    it('should handle transactions', async () => {
      // Create table
      await connection.execute(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY,
          balance DECIMAL(10,2)
        )
      `);
      
      await connection.execute('INSERT INTO accounts (id, balance) VALUES (1, 100.00)');
      await connection.execute('INSERT INTO accounts (id, balance) VALUES (2, 50.00)');
      
      // Start transaction
      await connection.beginTransaction();
      
      try {
        await connection.execute('UPDATE accounts SET balance = balance - 25 WHERE id = 1');
        await connection.execute('UPDATE accounts SET balance = balance + 25 WHERE id = 2');
        
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
      
      // Verify transaction completed
      const result = await connection.query('SELECT balance FROM accounts ORDER BY id');
      expect(result.rows[0].balance).toBe(75);
      expect(result.rows[1].balance).toBe(75);
    });

    it('should rollback transaction on error', async () => {
      // Create table
      await connection.execute(`
        CREATE TABLE test_rollback (
          id INTEGER PRIMARY KEY,
          value TEXT UNIQUE
        )
      `);
      
      await connection.execute('INSERT INTO test_rollback (id, value) VALUES (1, "initial")');
      
      await connection.beginTransaction();
      
      try {
        await connection.execute('INSERT INTO test_rollback (id, value) VALUES (2, "test")');
        // This should fail due to unique constraint
        await connection.execute('INSERT INTO test_rollback (id, value) VALUES (3, "test")');
        await connection.commit();
      } catch (error) {
        await connection.rollback();
      }
      
      // Verify rollback worked
      const result = await connection.query('SELECT COUNT(*) as count FROM test_rollback');
      expect(result.rows[0].count).toBe(1); // Only initial record should remain
    });

    it('should handle query errors gracefully', async () => {
      await expect(connection.query('SELECT * FROM non_existent_table'))
        .rejects.toThrow('SQLite query failed');
    });

    it('should handle execute errors gracefully', async () => {
      await expect(connection.execute('INVALID SQL STATEMENT'))
        .rejects.toThrow('SQLite execute failed');
    });

    it('should prevent nested transactions', async () => {
      await connection.beginTransaction();
      
      await expect(connection.beginTransaction())
        .rejects.toThrow('Transaction already in progress');
      
      await connection.rollback();
    });

    it('should prevent commit without transaction', async () => {
      await expect(connection.commit())
        .rejects.toThrow('No transaction in progress');
    });

    it('should prevent rollback without transaction', async () => {
      await expect(connection.rollback())
        .rejects.toThrow('No transaction in progress');
    });
  });
});