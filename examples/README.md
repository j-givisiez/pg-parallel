# `pg-parallel` Usage Examples

[![Examples Status](https://img.shields.io/badge/examples-6%20working-brightgreen.svg)](./README.md)
[![Setup Required](https://img.shields.io/badge/setup-PostgreSQL%20required-orange.svg)](#getting-started)
[![TypeScript](https://img.shields.io/badge/TypeScript-compatible-blue.svg)](https://www.typescriptlang.org/)

Welcome! This directory contains **6 comprehensive examples** that demonstrate
the full capabilities of `pg-parallel`. Each example is self-contained,
thoroughly documented, and designed to showcase different use cases and
patterns.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Database Setup](#database-setup)
  - [Environment Configuration](#environment-configuration)
  - [Data Initialization](#data-initialization)
- [Examples Overview](#examples-overview)
- [Running Examples](#running-examples)
  - [Example 1: Basic I/O Query](#example-1-basic-io-query)
  - [Example 2: CPU-Intensive Task](#example-2-cpu-intensive-task)
  - [Example 3: Mixed Workload (ETL)](#example-3-mixed-workload-etl)
  - [Example 4: Advanced File-based Workers](#example-4-advanced-file-based-workers)
  - [Example 5: Simple File-based Workers](#example-5-simple-file-based-workers)
  - [Example 6: Workers with External Imports](#example-6-workers-with-external-imports)
  - [Example 7: Utility Classes](#example-7-utility-classes)
- [Worker Files](#worker-files)
- [Performance Notes](#performance-notes)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Contributing](#contributing)

## Overview

These examples demonstrate:

- **Basic Usage**: Simple database queries and CPU tasks
- **Advanced Patterns**: File-based workers and external imports
- **Real-world Scenarios**: ETL processes and data transformation
- **Performance Optimization**: Worker thread utilization
- **Error Handling**: Robust error management patterns
- **TypeScript Integration**: Type-safe implementations

## Getting Started

### Prerequisites

Before running the examples, ensure you have:

- **Node.js** v18.x or higher
- **PostgreSQL** server running locally or remotely
- **npm** or **yarn** package manager
- **TypeScript** knowledge (helpful but not required)

### Database Setup

1. **Create a dedicated database** for the examples:

   ```bash
   # Using createdb (if available)
   createdb pg_parallel_examples

   # Or using psql
   psql -c "CREATE DATABASE pg_parallel_examples;"
   ```

2. **Verify connection** to your PostgreSQL server:
   ```bash
   psql -h localhost -U your_username -d pg_parallel_examples -c "SELECT version();"
   ```

### Environment Configuration

1. **Create environment file** in the project root:

   ```bash
   # From the project root directory
   touch .env
   ```

2. **Add your database connection string**:

   ```env
   # .env file
   DATABASE_URL="postgresql://username:password@localhost:5432/pg_parallel_examples"
   ```

   **Connection string format:**

   - `username`: Your PostgreSQL username
   - `password`: Your PostgreSQL password
   - `localhost`: Database host (change if remote)
   - `5432`: PostgreSQL port (default)
   - `pg_parallel_examples`: Database name

### Data Initialization

**Run the setup script** to create tables and seed data:

```bash
# From the project root
psql -U your_username -d pg_parallel_examples -f examples/setup.sql
```

**Expected output:**

```
CREATE TABLE
INSERT 0 5
CREATE TABLE
INSERT 0 4
CREATE TABLE
Database setup complete
Created tables: users, raw_events, processed_reports
Seeded tables with sample data
```

## Examples Overview

| Example | Focus Area          | Difficulty      | Runtime | Key Features                           |
| ------- | ------------------- | --------------- | ------- | -------------------------------------- |
| **01**  | Basic I/O           | 🟢 Beginner     | ~1s     | Simple queries, error handling         |
| **02**  | CPU Tasks           | 🟡 Intermediate | ~10s    | Fibonacci calculation, non-blocking    |
| **03**  | Mixed Workload      | 🟡 Intermediate | ~3s     | ETL process, transactions              |
| **04**  | File Workers        | 🔴 Advanced     | ~2s     | External modules, complex logic        |
| **05**  | Simple File Workers | 🟡 Intermediate | ~1s     | File-based execution intro             |
| **06**  | External Imports    | 🔴 Advanced     | ~2s     | ID generation, parallel execution      |
| **07**  | Utility Classes     | 🔴 Advanced     | ~1s     | Error handling, retry, circuit breaker |

## Running Examples

### Example 1: Basic I/O Query

**Purpose:** Demonstrates simple database queries on the main thread.

**Command:**

```bash
ts-node examples/01-basic-query.ts
```

**What it teaches:**

- Basic `PgParallel` initialization
- Simple SELECT queries
- Proper connection management
- Error handling patterns

**Expected Output:**

```
Running Example 1: Basic Query
Query successful: Fetched users
┌─────────┬───┬─────────┬─────────────────────────┐
│ (index) │id │  name   │          email          │
├─────────┼───┼─────────┼─────────────────────────┤
│    0    │ 1 │ 'Alice' │ 'alice@example.com'     │
│    1    │ 2 │  'Bob'  │  'bob@example.com'      │
│    2    │ 3 │'Charlie'│  'charlie@example.com'  │
│    3    │ 4 │ 'Diana' │ 'diana@example.com'     │
│    4    │ 5 │  'Eve'  │  'eve@example.com'      │
└─────────┴───┴─────────┴─────────────────────────┘
Database connection shut down
```

### Example 2: CPU-Intensive Task

**Purpose:** Shows how `db.task()` offloads heavy computation to workers while
keeping the main thread responsive.

**Command:**

```bash
ts-node examples/02-cpu-intensive-task.ts
```

**What it teaches:**

- CPU-intensive task offloading
- Worker thread utilization
- Main thread responsiveness
- Named function patterns

**Expected Output:**

```
Running Example 2: CPU-Intensive Task
Warming up worker pool...
Worker pool is ready
Event loop is not blocked (Tick 1)

Offloading a heavy CPU task (Fibonacci of 42) to a worker
Event loop is not blocked (Tick 2)
Event loop is not blocked (Tick 3)
Event loop is not blocked (Tick 4)

CPU task completed in worker: Result 267914296
Workers and database connection shut down
```

### Example 3: Mixed Workload (ETL)

**Purpose:** Simulates a real-world ETL (Extract, Transform, Load) process
combining database I/O with processing logic.

**Command:**

```bash
ts-node examples/03-mixed-workload-etl.ts
```

**What it teaches:**

- Database transactions in workers
- ETL process patterns
- Error handling in transactions
- Complex data processing

**Expected Output:**

```
Running Example 3: Mixed Workload (ETL)
Offloading ETL process to a worker
[Worker] Starting ETL process
[Worker] Transaction started
[Worker] Extracted 4 new events
[Worker] Processing event: {"type": "click", "user_id": 1, "target": "#button1"}
[Worker] Processing event: {"type": "purchase", "user_id": 2, "product_id": 123, "amount": 99.99}
[Worker] Processing event: {"type": "login", "user_id": 1}
[Worker] Processing event: {"type": "comment", "user_id": 3, "text": "This is a great library!"}
[Worker] Transaction committed successfully

ETL process completed: Processed 4 events
Workers and database connection shut down
```

### Example 4: Advanced File-based Workers

**Purpose:** Demonstrates sophisticated file-based worker patterns for
production applications.

**Commands:**

```bash
# Compile TypeScript to JavaScript
npx tsc examples/04-advanced-usage.ts --outDir dist-examples --target es2020 --module commonjs --esModuleInterop --skipLibCheck

# Run compiled JavaScript
node dist-examples/04-advanced-usage.js
```

**Alternative (using npm script):**

```bash
# Add to package.json scripts:
npm run example:04
```

**What it teaches:**

- File-based worker organization
- Multiple worker functions
- Complex data processing
- Production-ready patterns

**Expected Output:**

```
Running Example 4: Advanced Usage with File-based Workers

=== Example 1: Default Handler ===
Default handler result: {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  message: 'Default handler executed successfully',
  timestamp: 2024-01-15T10:30:45.123Z
}

=== Example 2: Named Function - generateReport ===
Report generation result: {
  id: 'b2c3d4e5-f6g7-8901-bcde-f23456789012',
  type: 'detailed',
  recordCount: 1,
  generatedAt: '2024-01-15T10:30:45.456Z',
  content: 'detailed Report for 1 records'
}

=== Example 3: Parallel Execution ===
All tasks completed successfully!
Task 1 result: { id: '...', type: 'summary', ... }
Task 2 result: { id: '...', type: 'detailed', ... }
Task 3 result: { id: '...', message: 'Parallel task', ... }

All advanced usage examples completed successfully!
```

### Example 5: Simple File-based Workers

**Purpose:** Gentle introduction to file-based worker execution with simplified
examples.

**Commands:**

```bash
# Compile and run
npx tsc examples/05-file-based-workers.ts --outDir dist-examples --target es2020 --module commonjs --esModuleInterop --skipLibCheck
node dist-examples/05-file-based-workers.js
```

**What it teaches:**

- Basic file-based workers
- Worker module structure
- Simple task execution
- Getting started with external files

**Expected Output:**

```
Running Example 5: File-based Workers

=== Example 1: Default Handler ===
Default handler result: {
  id: 'c3d4e5f6-g7h8-9012-cdef-345678901234',
  message: 'Default handler executed successfully',
  timestamp: 2024-01-15T10:30:46.789Z
}

All file-based worker examples completed successfully!
```

### Example 6: Workers with External Imports

**Purpose:** Demonstrates how file-based workers can import and use external
libraries.

**Commands:**

```bash
# Compile and run
npx tsc examples/06-worker-with-imports.ts --outDir dist-examples --target es2020 --module commonjs --esModuleInterop --skipLibCheck
node dist-examples/06-worker-with-imports.js
```

**What it teaches:**

- External library imports in workers
- ID generation in workers
- Parallel worker execution
- Complex data structures

**Expected Output:**

```
Testing file-based worker with imports...

1. Default handler with randomUUID:
   Result: {
     id: 'd4e5f6g7-h8i9-0123-defg-456789012345',
     message: 'Task with randomUUID generation',
     timestamp: 2024-01-15T10:30:47.012Z
   }
   ID generated: d4e5f6g7-h8i9-0123-defg-456789012345

2. Named function with randomUUID:
   Result: {
     id: 'e5f6g7h8-i9j0-1234-efgh-567890123456',
     type: 'detailed',
     recordCount: 1,
     generatedAt: '2024-01-15T10:30:47.345Z',
     content: 'detailed Report for 1 records'
   }
   Report ID generated: e5f6g7h8-i9j0-1234-efgh-567890123456

3. Multiple parallel workers:
   Task 1: { id: 'f6g7h8i9-j0k1-2345-fghi-678901234567', type: 'summary', ... }
   Task 2: { id: 'g7h8i9j0-k1l2-3456-ghij-789012345678', type: 'detailed', ... }
   Task 3: { id: 'h8i9j0k1-l2m3-4567-hijk-890123456789', type: 'handler', ... }

All workers completed successfully!
Key benefits demonstrated:
   - Workers can use require() to import external libraries
   - Each worker execution gets unique IDs via crypto.randomUUID
   - Multiple workers can run in parallel
   - Database queries work normally within workers
```

### Example 7: Utility Classes

**Purpose:** Demonstrates advanced usage of exported utility classes for custom
error handling, retry logic, and circuit breaker patterns.

**Command:**

```bash
ts-node examples/07-utilities-usage.ts
```

**Expected Output:**

```
Running Example 7: Utilities Usage

=== Error Utilities Demo ===
Timeout error category: TIMEOUT
Connection error category: CONNECTION
Unknown error category: UNKNOWN
Is timeout transient? true
Is connection transient? true

=== Retry Utilities Demo ===
  Attempt 1
  Attempt 2
  Attempt 3
Retry result: Success after retries!

=== Circuit Breaker Utilities Demo ===
Initial breaker state: CLOSED
Default config: {
  failureThreshold: 5,
  cooldownMs: 10000,
  halfOpenMaxCalls: 2,
  halfOpenSuccessesToClose: 2
}
After failure 1, state: CLOSED, consecutive failures: 1
After failure 2, state: CLOSED, consecutive failures: 2
After failure 3, state: CLOSED, consecutive failures: 3
After failure 4, state: CLOSED, consecutive failures: 4
After failure 5, state: OPEN, consecutive failures: 5
After failure 6, state: OPEN, consecutive failures: 6
After success, state: OPEN

=== Integration with PgParallel ===
PgParallel instance created with custom retry and circuit breaker configs

Utilities demo completed!
```

**Key Features:**

- **Error Classification**: Demonstrates error categorization and transient
  detection
- **Custom Retry Logic**: Shows independent usage of retry utilities
- **Circuit Breaker Management**: Illustrates circuit breaker state management
- **Advanced Configuration**: Integration with PgParallel using custom configs

## Worker Files

The examples utilize reusable worker modules located in the `tasks/` directory:

### `tasks/report-worker.js`

**Purpose:** Comprehensive worker module demonstrating multiple functions and
external imports.

**Features:**

- **ID Generation**: Uses `crypto.randomUUID` for unique identifiers
- **Multiple Functions**: `generateReport()` and `handler()` functions
- **Database Integration**: Executes queries within workers
- **Error Handling**: Robust error management
- **Type Safety**: Proper parameter validation

**Functions:**

- `generateReport(client, reportType)`: Generates reports with database queries
- `handler(client, message)`: Default handler for simple tasks

## Performance Notes

### Example Performance Characteristics

| Example | Main Thread   | Worker Threads | Database Queries | Memory Usage |
| ------- | ------------- | -------------- | ---------------- | ------------ |
| **01**  | ✅ Active     | ❌ None        | 1 simple         | Low          |
| **02**  | ✅ Responsive | ✅ 1 worker    | 0                | Medium       |
| **03**  | ✅ Responsive | ✅ 1 worker    | 3-5 queries      | Medium       |
| **04**  | ✅ Responsive | ✅ 1-3 workers | 1-3 queries      | Medium-High  |
| **05**  | ✅ Responsive | ✅ 1 worker    | 1 query          | Low-Medium   |
| **06**  | ✅ Responsive | ✅ 3 workers   | 3 queries        | Medium-High  |

### Performance Tips

1. **Example 2** demonstrates the most significant performance benefit (2.8x
   faster)
2. **Examples 4-6** show minimal overhead for file-based workers
3. **Example 3** represents real-world ETL performance patterns
4. **Example 1** shows the I/O overhead (~30% slower than raw `pg.Pool`)

## Troubleshooting

### Common Issues

#### Database Connection Errors

**Problem:** `ECONNREFUSED` or authentication errors.

**Solutions:**

1. **Verify PostgreSQL is running:**

   ```bash
   pg_isready -h localhost -p 5432
   ```

2. **Check connection string format:**

   ```env
   # Correct format
   DATABASE_URL="postgresql://username:password@host:port/database"
   ```

3. **Test connection manually:**
   ```bash
   psql "postgresql://username:password@localhost:5432/pg_parallel_examples"
   ```

#### Setup Script Fails

**Problem:** `setup.sql` execution fails.

**Solutions:**

1. **Ensure database exists:**

   ```bash
   createdb pg_parallel_examples
   ```

2. **Check file permissions:**

   ```bash
   ls -la examples/setup.sql
   ```

3. **Run script with verbose output:**
   ```bash
   psql -U username -d pg_parallel_examples -f examples/setup.sql -v ON_ERROR_STOP=1
   ```

#### TypeScript Compilation Issues

**Problem:** File-based examples fail to compile.

**Solutions:**

1. **Use provided compilation command:**

   ```bash
   npx tsc examples/04-advanced-usage.ts --outDir dist-examples --target es2020 --module commonjs --esModuleInterop --skipLibCheck
   ```

2. **Alternative: Create npm scripts:**
   ```json
   {
     "scripts": {
       "example:04": "tsc examples/04-advanced-usage.ts --outDir dist-examples --target es2020 --module commonjs --esModuleInterop --skipLibCheck && node dist-examples/04-advanced-usage.js"
     }
   }
   ```

#### Worker Thread Errors

**Problem:** "Worker thread failed to start" or hanging processes.

**Solutions:**

1. **Ensure Node.js version:**

   ```bash
   node --version  # Should be >= 18.x
   ```

2. **Check worker file paths:**

   ```ts
   // Use absolute paths
   const workerPath = path.resolve(
     process.cwd(),
     'examples/tasks/report-worker.js',
   );
   ```

3. **Verify worker file syntax:**
   ```bash
   node -c examples/tasks/report-worker.js
   ```

#### Performance Issues

**Problem:** Examples run slower than expected.

**Solutions:**

1. **Warm up workers first:**

   ```ts
   await db.warmup();
   ```

2. **Check system resources:**

   ```bash
   top -p $(pgrep node)
   ```

3. **Monitor database performance:**
   ```sql
   SELECT * FROM pg_stat_activity WHERE datname = 'pg_parallel_examples';
   ```

### Getting Help

If you encounter issues not covered here:

1. **Check the main repository issues:**
   [GitHub Issues](https://github.com/j-givisiez/pg-parallel/issues)
2. **Review the main README:** [Project Documentation](../README.md)
3. **Examine the source code:** All examples are in this directory
4. **Create a minimal reproduction:** Copy the failing example and simplify it

## Best Practices

### Development Workflow

1. **Start with Example 1** to verify basic setup
2. **Progress through examples** in numerical order
3. **Modify examples** to understand behavior
4. **Create your own workers** based on the patterns shown

### Production Considerations

1. **Use file-based workers** for complex logic (Examples 4-6)
2. **Implement proper error handling** as shown in Example 3
3. **Monitor worker performance** using the patterns in Example 2
4. **Structure worker modules** following the `tasks/` directory pattern

### Code Organization

1. **Separate worker logic** into dedicated files
2. **Use TypeScript** for main application code
3. **Keep worker files as JavaScript** for compatibility
4. **Follow the module.exports pattern** for worker files

## Contributing

Found an issue with the examples or want to add a new one?

1. **Fork the repository**
2. **Create a new example** following the existing patterns
3. **Add documentation** to this README
4. **Test thoroughly** with different environments
5. **Submit a pull request**

### Example Contribution Guidelines

- **Follow the naming convention:** `XX-descriptive-name.ts`
- **Include comprehensive comments** in your code
- **Add expected output** to this README
- **Test with multiple PostgreSQL versions**
- **Ensure TypeScript compatibility**

---

**Happy coding with `pg-parallel`!** 🚀

For more information, visit the [main project documentation](../README.md).
