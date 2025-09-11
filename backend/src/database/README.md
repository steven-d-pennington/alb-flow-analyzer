# Database Configuration and Connection Management

This module provides a unified interface for managing database connections across multiple database types including SQLite, PostgreSQL, ClickHouse, and DuckDB.

## Features

- **Multi-database support**: SQLite, PostgreSQL, ClickHouse, and DuckDB
- **Connection pooling**: Efficient connection management with configurable pool sizes
- **Transaction support**: Begin, commit, and rollback transactions
- **Type-safe configuration**: TypeScript interfaces for all configuration options
- **Error handling**: Comprehensive error types and handling
- **Configuration validation**: Built-in validation for database configurations
- **Builder pattern**: Fluent API for creating database configurations

## Quick Start

### Basic Usage

```typescript
import { connectionFactory, DatabaseConfigBuilder } from './database';

// Create a configuration
const config = DatabaseConfigBuilder.create()
  .type('sqlite')
  .database('app.db')
  .maxConnections(10)
  .build();

// Create a connection pool
const pool = await connectionFactory.createPool(config);

// Acquire a connection
const connection = await pool.acquire();

// Execute queries
await connection.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
const result = await connection.query('SELECT * FROM users');

// Release connection
await pool.release(connection);
```

### Configuration Options

#### SQLite Configuration

```typescript
const sqliteConfig = DatabaseConfigBuilder.create()
  .type('sqlite')
  .database('app.db')  // or use .filename('app.db')
  .maxConnections(10)
  .build();
```

#### PostgreSQL Configuration

```typescript
const postgresConfig = DatabaseConfigBuilder.create()
  .type('postgresql')
  .host('localhost')
  .port(5432)
  .database('myapp')
  .username('user')
  .password('password')
  .ssl(true)
  .poolConfig({
    min: 2,
    max: 20,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  })
  .build();

// Or use connection string
const postgresConfigWithConnectionString = DatabaseConfigBuilder.create()
  .type('postgresql')
  .connectionString('postgresql://user:password@localhost:5432/myapp')
  .build();
```

#### ClickHouse Configuration

```typescript
const clickhouseConfig = DatabaseConfigBuilder.create()
  .type('clickhouse')
  .host('localhost')
  .port(8123)
  .database('default')
  .username('default')
  .clickhouseConfig({
    format: 'JSONEachRow',
    session_timeout: 60
  })
  .build();
```

#### DuckDB Configuration

```typescript
const duckdbConfig = DatabaseConfigBuilder.create()
  .type('duckdb')
  .filename('analytics.duckdb')  // or use .database('analytics.duckdb')
  .maxConnections(5)
  .build();
```

### Using Default Configurations

```typescript
import { createDefaultConfig } from './database';

// Create SQLite config with defaults
const sqliteConfig = createDefaultConfig('sqlite', {
  database: 'custom.db'
});

// Create PostgreSQL config with defaults
const postgresConfig = createDefaultConfig('postgresql', {
  host: 'localhost',
  database: 'myapp',
  username: 'user',
  password: 'password'
});
```

### Transaction Handling

```typescript
const connection = await pool.acquire();

try {
  await connection.beginTransaction();
  
  await connection.execute('INSERT INTO accounts (name, balance) VALUES (?, ?)', ['Alice', 100]);
  await connection.execute('INSERT INTO accounts (name, balance) VALUES (?, ?)', ['Bob', 50]);
  
  await connection.commit();
  console.log('Transaction completed successfully');
} catch (error) {
  await connection.rollback();
  console.error('Transaction failed:', error);
} finally {
  await pool.release(connection);
}
```

### Error Handling

The module provides specific error types for different scenarios:

```typescript
import { DatabaseError, ConnectionError, QueryError } from './database';

try {
  const result = await connection.query('SELECT * FROM users');
} catch (error) {
  if (error instanceof QueryError) {
    console.error('Query failed:', error.message);
    console.error('Failed query:', error.query);
  } else if (error instanceof ConnectionError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof DatabaseError) {
    console.error('Database error:', error.message);
    console.error('Error code:', error.code);
  }
}
```

### Configuration Validation

```typescript
import { DatabaseConfigValidator } from './database';

const config = {
  type: 'postgresql',
  // missing required fields
};

const errors = DatabaseConfigValidator.validate(config);
if (errors.length > 0) {
  console.error('Configuration errors:', errors);
}

// Or use the boolean check
if (!DatabaseConfigValidator.isValid(config)) {
  console.error('Invalid configuration');
}
```

### Pool Management

```typescript
// Get pool statistics
const stats = pool.getStats();
console.log('Total connections:', stats.totalConnections);
console.log('Active connections:', stats.activeConnections);
console.log('Idle connections:', stats.idleConnections);
console.log('Waiting clients:', stats.waitingClients);

// Close specific pool
await connectionFactory.closePool(config);

// Close all pools
await connectionFactory.closeAllPools();
```

## Database-Specific Notes

### SQLite
- Supports in-memory databases with `:memory:`
- Automatically enables foreign keys and optimizes settings
- Best for development and small to medium datasets
- Single-writer, multiple-reader architecture

### PostgreSQL
- Full ACID compliance with advanced features
- Excellent for production applications
- Supports JSON, arrays, and custom types
- Horizontal scaling options available

### ClickHouse
- Optimized for analytical workloads (OLAP)
- Columnar storage with excellent compression
- Best for time-series and analytics data
- Limited transaction support

### DuckDB
- In-process analytical database
- Excellent for data science and analytics
- Parquet file support
- No server management required

## Testing

The module includes comprehensive unit tests for all components:

```bash
npm test -- --testPathPattern=database
```

Tests cover:
- Configuration validation
- Connection pool management
- Query execution and transactions
- Error handling scenarios
- All database adapter implementations

## Architecture

The module follows a layered architecture:

1. **Types Layer**: TypeScript interfaces and error classes
2. **Configuration Layer**: Configuration builders and validators
3. **Factory Layer**: Connection factory for creating pools
4. **Adapter Layer**: Database-specific implementations
5. **Pool Layer**: Connection pooling and lifecycle management

Each database type has its own adapter that implements the common `DatabaseConnection` and `ConnectionPool` interfaces, ensuring consistent behavior across all supported databases.