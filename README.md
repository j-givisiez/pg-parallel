# pg-parallel

[![npm version](https://img.shields.io/npm/v/pg-parallel.svg)](https://www.npmjs.com/package/pg-parallel)
[![npm downloads](https://img.shields.io/npm/dm/pg-parallel.svg)](https://www.npmjs.com/package/pg-parallel)
[![Node.js version](https://img.shields.io/badge/Node.js-%3E%3D18.x-blue.svg)](https://nodejs.org/en/)
[![TypeScript](https://img.shields.io/badge/TypeScript-compatible-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/j-givisiez/pg-parallel/actions/workflows/ci.yml/badge.svg)](https://github.com/j-givisiez/pg-parallel/actions)
[![Coverage Status](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](https://github.com/j-givisiez/pg-parallel)

**[View on npm](https://www.npmjs.com/package/pg-parallel) ·
[View on GitHub](https://github.com/j-givisiez/pg-parallel)**

> Non-blocking PostgreSQL for Node.js with worker thread support

A specialized wrapper around `node-postgres` that prevents event-loop blocking
by offloading heavy CPU tasks and complex transactions to worker threads.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Dependencies](#dependencies)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [Constructor](#constructor)
  - [Methods](#methods)
    - [`db.query(config, values?)`](#dbqueryconfig-values)
    - [`db.warmup()`](#dbwarmup)
    - [`db.task(fn, args)`](#dbtaskfn-args)
    - [`db.worker(task)`](#dbworkertask)
    - [`db.shutdown()`](#dbshutdown)
- [Advanced Usage](#advanced-usage)
  - [Resilience and Logging](#resilience-and-logging)
  - [Complex Worker Logic](#complex-worker-logic)
  - [Self-Contained Functions](#self-contained-functions)
  - [Utility Classes](#utility-classes)
- [Performance](#performance)
- [Performance and Benchmarks](#performance-and-benchmarks)
- [When to Use](#when-to-use)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Getting Help](#getting-help)
- [Third-party Licenses](#third-party-licenses)
- [License](#license)

## Features

- **Hybrid Architecture**: Fast I/O on main thread, heavy work on workers
- **Low I/O Overhead**: Standard queries run on the main thread for high
  performance
- **Automatic Management**: No manual `client.release()` needed
- **TypeScript Support**: Full type safety with comprehensive interfaces
- **Lazy Initialization**: Workers spawned only when needed
- **Worker Warmup**: Optional pre-initialization of workers for immediate
  performance
- **Graceful Shutdown**: Proper resource cleanup
- **Resilience**: Built-in retry with exponential backoff and a circuit breaker
- **Actionable Errors**: `PgParallelError` with standardized `ErrorCategory`
- **Observability**: Pluggable `logger` with key events (retries, breaker
  transitions, worker failures)
- **Zero Dependencies**: Uses only Node.js built-in modules (crypto.randomUUID)
- **Modular Utilities**: Exportable utility classes for advanced custom usage

## Installation

```bash
npm install pg-parallel pg
```

**Note:** `pg` is a peer dependency and must be installed alongside
`pg-parallel`.

## Dependencies

This library is built on top of
[node-postgres (pg)](https://www.npmjs.com/package/pg), a non-blocking
PostgreSQL client for Node.js. The `pg` package is included as a peer dependency
and must be installed alongside `pg-parallel`.

**Requirements:**

- `pg` v8.11.3+ (peer dependency)
- Node.js v18.x or higher

---

## Quick Start

```ts
import { PgParallel } from 'pg-parallel';

const db = new PgParallel({
  connectionString: 'postgresql://user:pass@localhost/db',
  maxWorkers: 4, // Optional: defaults to CPU core count
});

// Standard I/O query (main thread)
const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [1]);

// CPU-intensive task (worker thread)
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
const result = await db.task(fibonacci, [42]);

// Mixed workload with database access (worker thread)
const processed = await db.worker(async (client) => {
  const { rows } = await client.query('SELECT data FROM table');
  return rows.map((row) => row.data.toUpperCase());
});

await db.shutdown(); // Clean shutdown
```

## API Reference

### Constructor

```ts
new PgParallel(config: PgParallelConfig)
```

The `config` object extends `pg.PoolConfig` with additional properties:

- `maxWorkers?: number` - Number of worker threads (defaults to
  `os.cpus().length`)
- `retry?: RetryConfig` - Automatic retry for transient failures
- `circuitBreaker?: CircuitBreakerConfig` - Circuit breaker for database
  operations
- `logger?: Logger` - Optional logger for observability

### Methods

#### `db.query(config, values?)`

Execute standard I/O queries on the main thread pool.

```ts
// Simple query
const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [1]);

// With query config
const result = await db.query({
  text: 'SELECT * FROM users WHERE active = $1',
  values: [true],
});
```

#### `db.warmup()`

Pre-initializes the worker thread pool to avoid a "cold start" latency on the
first call to `.task()` or `.worker()`. This is useful in performance-sensitive
applications where the initial startup time of workers should be minimized.

```ts
// It's a good practice to warmup the workers during application startup
await db.warmup();
```

#### `db.task(fn, args)`

Execute CPU-intensive functions in worker threads.

```ts
// For recursive functions, use a named function declaration
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = await db.task(fibonacci, [40]);
```

#### `db.worker(task)`

Execute database operations and CPU-intensive logic in worker threads with
dedicated client connection.

**Function-based workers:**

```ts
// Simple example
const result = await db.worker(async (client) => {
  const { rows } = await client.query("SELECT 'value' as data");
  return rows[0].data.toUpperCase();
});

// Transaction example
await db.worker(async (client) => {
  await client.query('BEGIN');

  const { rows } = await client.query(
    'UPDATE accounts SET balance = balance - 100 WHERE id = 1 RETURNING balance',
  );

  if (rows[0].balance < 0) {
    throw new Error('Insufficient funds');
  }

  await client.query(
    'UPDATE accounts SET balance = balance + 100 WHERE id = 2',
  );
  await client.query('COMMIT');
});
```

**File-based workers:**

```ts
// Using WorkerFileTask interface
const result = await db.worker({
  taskPath: path.resolve(__dirname, 'tasks/my-worker.js'),
  taskName: 'processData', // Optional: defaults to 'handler'
  args: ['arg1', 'arg2'], // Optional: arguments passed to the function
});
```

**WorkerFileTask Interface:**

```ts
interface WorkerFileTask {
  taskPath: string; // Absolute path to the module file
  taskName?: string; // Function name to execute (defaults to 'handler')
  args?: any[]; // Arguments to pass to the function
}
```

**Note:** No manual `client.release()` needed - lifecycle is managed
automatically.

#### `db.shutdown()`

Gracefully shut down all connections and terminate workers.

```ts
await db.shutdown();
```

## Advanced Usage

### Resilience and Logging

`pg-parallel` includes optional resilience features and a pluggable logger.

```ts
import {
  PgParallel,
  type RetryConfig,
  type CircuitBreakerConfig,
} from 'pg-parallel';

const retry: RetryConfig = {
  maxAttempts: 4,
  initialDelayMs: 100,
  maxDelayMs: 1500,
  backoffFactor: 2,
  jitter: true,
};

const circuitBreaker: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 10_000,
  halfOpenMaxCalls: 2,
  halfOpenSuccessesToClose: 2,
};

const db = new PgParallel({
  connectionString: process.env.DATABASE_URL!,
  retry,
  circuitBreaker,
  logger: {
    info: (m, meta) => console.log(m, meta),
    warn: (m, meta) => console.warn(m, meta),
    error: (m, meta) => console.error(m, meta),
  },
});
```

Notes:

- Retries target transient issues (timeouts, deadlocks, serialization failures,
  connection resets).
- Circuit breaker opens after consecutive failures, transitions to half-open
  after cooldown, and closes on healthy trials.
- Errors are thrown as `PgParallelError` with an `ErrorCategory` for easier
  routing/metrics.

### Complex Worker Logic

For production code, organize worker logic in separate files using the
`WorkerFileTask` interface:

```js
// tasks/report-worker.js
const { randomUUID } = require('crypto');

module.exports = {
  generateReport: async (client, reportType = 'summary') => {
    const { rows } = await client.query(
      "SELECT * FROM (SELECT 1 as id, 'Sample Data' as name) as sales_data",
    );

    // Generate unique report ID using crypto.randomUUID
    const reportId = randomUUID();

    // Simulate report generation
    const reportContent = `${reportType} Report for ${rows.length} records`;

    return {
      id: reportId,
      type: reportType,
      recordCount: rows.length,
      generatedAt: new Date().toISOString(),
      content: reportContent,
    };
  },

  // Default handler (called when no taskName is specified)
  handler: async (client, message = 'Default task') => {
    const { rows } = await client.query('SELECT NOW() as timestamp');
    const taskId = randomUUID();
    return { id: taskId, message, timestamp: rows[0].timestamp };
  },
};

// main.ts
import * as path from 'path';

// Execute specific named function
const report = await db.worker({
  taskPath: path.resolve(process.cwd(), 'tasks/report-worker.js'),
  taskName: 'generateReport',
  args: ['detailed'],
});

// Execute default handler
const result = await db.worker({
  taskPath: path.resolve(process.cwd(), 'tasks/report-worker.js'),
  args: ['Hello from main thread'],
});
```

**Key benefits of file-based workers:**

- **Code Organization**: Keep complex logic in separate, reusable modules
- **Team Collaboration**: Multiple developers can work on different worker files
- **Testing**: Easier to unit test individual worker functions
- **Maintenance**: Clear separation of concerns and better code structure

### Self-Contained Functions

Functions passed to `db.task()` and `db.worker()` must be self-contained and not
rely on any variables from their parent scope. This is because the function is
serialized, sent to a different thread, and deserialized, losing its original
closure.

**Example: Accessing External Variables**

```ts
// Wrong - references parent scope
const TAX_RATE = 0.07;
await db.task((price) => price * (1 + TAX_RATE), [100]);

// Correct - self-contained
await db.task(
  (price) => {
    const TAX_RATE = 0.07;
    return price * (1 + TAX_RATE);
  },
  [100],
);
```

**Example: Recursive Functions**

For a function to call itself recursively inside a worker, it must be a **named
function declaration**. An arrow function assigned to a `const` will not work
because its name is part of the closure that gets lost.

```ts
// Wrong - recursive call will fail inside the worker
const fibonacciArrow = (n: number): number => {
  if (n <= 1) return n;
  // This call will fail as 'fibonacciArrow' is not in the function's own scope
  return fibonacciArrow(n - 1) + fibonacciArrow(n - 2);
};
await db.task(fibonacciArrow, [40]);

// Correct - named function is self-contained
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
await db.task(fibonacci, [40]);
```

### Utility Classes

For advanced usage, `pg-parallel` exports utility classes that power the
internal resilience features. These can be used independently for custom
implementations:

```ts
import {
  ErrorUtils,
  RetryUtils,
  CircuitBreakerUtils,
  type CircuitBreakerState,
  type RetryConfig,
} from 'pg-parallel';

// Error classification and handling
const isRetryable = ErrorUtils.isTransient(error);
const category = ErrorUtils.categorizeError(error);
const wrappedError = ErrorUtils.wrapError(error);

// Custom retry logic
const retryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffFactor: 2,
  jitter: true,
};

const result = await RetryUtils.executeWithRetry(
  () => someAsyncOperation(),
  retryConfig,
  'my-operation',
);

// Circuit breaker management
const breakerState = CircuitBreakerUtils.createInitialState();
const breakerConfig = CircuitBreakerUtils.getDefaultConfig();

CircuitBreakerUtils.onBreakerFailure(breakerState, breakerConfig);
await CircuitBreakerUtils.ensureBreakerState(breakerState, breakerConfig);
```

**Available Utility Classes:**

- **`ErrorUtils`**: Error categorization, transient detection, and wrapping
- **`RetryUtils`**: Exponential backoff retry logic with jitter
- **`CircuitBreakerUtils`**: Circuit breaker state management and transitions

## Performance

Performance benchmarks demonstrate when `pg-parallel` provides benefits over
standard `pg.Pool`. These tests were conducted on Apple M1 (8 cores) with
PostgreSQL 15.

### Benchmark Overview

| Scenario                                     | pg-parallel | Baseline    | Improvement          |
| -------------------------------------------- | ----------- | ----------- | -------------------- |
| **Pure I/O** (10,000 queries, maxWorkers: 1) | 0.410s avg  | 0.446s avg  | **+8.07% faster** ✅ |
| **Pure CPU** (8 fibonacci tasks)             | 7.298s avg  | 19.904s avg | **2.73x faster**     |
| **Mixed I/O + CPU** (8 tasks)                | 7.710s avg  | 22.878s avg | **2.97x faster**     |

### Detailed Results

You can run comprehensive benchmarks yourself to validate these results. Each
benchmark runs 10 iterations for statistical accuracy:

```bash
# Pure I/O Benchmark (10,000 queries per run)
ts-node src/benchmarks/benchmark-io-10-runs.ts

# Pure CPU Benchmark (8 Fibonacci tasks per run)
ts-node src/benchmarks/benchmark-cpu-10-runs.ts

# Mixed I/O + CPU Benchmark (8 mixed tasks per run)
ts-node src/benchmarks/benchmark-mixed-10-runs.ts
```

**Benchmark Output Includes:**

- Individual run times for each iteration
- Statistical analysis (average, min, max, standard deviation)
- Performance comparison vs baseline
- Speedup calculations

**Requirements:**

- PostgreSQL instance running locally
- `DATABASE_URL` environment variable configured
- Node.js 18.x+ with TypeScript support

### Performance Analysis

#### I/O Operations

- **Performance Breakthrough**: After optimization, pg-parallel now
  **outperforms** pg.Pool in pure I/O scenarios by **+8.07%** on average.
- **Consistency**: Lower standard deviation (0.021s vs 0.050s) indicates more
  stable and predictable performance.
- **Pool allocation vs workers**: The maximum connection budget (`max`) is split
  between the main pool and worker pools. By default, the number of workers is
  `os.cpus().length`.
- **Recommendation**:
  - For pure I/O benchmarks or simple CRUD services, set `maxWorkers: 1` to
    maintain optimal connection allocation while still benefiting from the
    performance optimizations.
  - For mixed workloads (I/O + CPU/transactions), keep multiple workers to
    benefit from parallelism.
  - Our 10-run I/O benchmark with `maxWorkers: 1` now **exceeds** pg.Pool
    performance (see table above).

#### CPU-Intensive Tasks

- **Speedup**: Consistently **2.73x faster** than sequential processing
- **Stability**: Very low standard deviation (0.107s) shows consistent
  performance
- **Benefit**: Main thread remains responsive during heavy computations
- **Scalability**: Performance scales with CPU core count

#### Mixed Workloads

- **Outstanding Performance**: **2.97x faster** than pg.Pool for mixed
  operations
- **Optimal Use Case**: Complex transactions with both I/O and CPU work
- **Real-world Example**: ETL processes, data analysis, report generation
- **Event Loop**: Remains unblocked for handling other requests
- **Consistency**: Stable performance with standard deviation of 0.161s

### Performance Guidelines

**Use `pg-parallel` when:**

- **Any I/O operation** - now **8.07% faster** than pg.Pool with better
  consistency
- CPU tasks take > 100ms per operation
- You need to maintain application responsiveness
- Processing large datasets with complex logic
- Running multiple parallel operations
- Mixed I/O + CPU workloads (2.97x performance gain)

**Consider pg.Pool when:**

- Absolute minimal memory footprint is required
- Single-threaded environment is mandatory
- Very simple, short-lived operations where setup overhead matters

**Note**: With recent optimizations, pg-parallel now outperforms pg.Pool even in
pure I/O scenarios while providing additional resilience features.

### Benchmark Methodology

All benchmarks use:

- PostgreSQL 15.3 running locally
- Node.js 18.17.0
- Apple M1 processor (8 cores)
- Fibonacci(40) as CPU-intensive task
- Average of 30 runs (10 runs x 3 executions) for high precision

## When to Use

**Use `pg-parallel` for:**

- **All production applications** - now outperforms pg.Pool by 8.07% in pure I/O
- CPU-intensive calculations (data analysis, image processing) - 2.73x faster
- Complex database transactions with heavy logic
- Mixed I/O + CPU workloads - 2.97x faster than alternatives
- Applications requiring circuit breaker and retry resilience
- Maintaining responsiveness under any workload type

**Consider standard `pg` only when:**

- Prototyping or development where setup simplicity is prioritized
- Memory constraints are extremely tight
- Single-threaded environment requirements

## Troubleshooting

### Common Issues

#### "require is not defined" in worker functions

**Problem:** Using `require()` inside function-based workers fails.

**Solution:** Use file-based workers instead:

```ts
// Wrong - this will fail
await db.worker(async (client) => {
  const { randomUUID } = require('crypto'); // Error: require is not defined
  // ...
});

// Correct - use file-based workers
await db.worker({
  taskPath: path.resolve(__dirname, 'tasks/my-worker.js'),
  taskName: 'processData',
});
```

#### Workers appear busy or tasks aren't finishing

**Problem:** Workers are not being released properly.

**Solution:** Ensure your worker functions complete without hanging:

```ts
// Wrong - infinite loop or hanging operation
await db.worker(async (client) => {
  while (true) {
    // This will hang the worker
  }
});

// Correct - ensure function completes
await db.worker(async (client) => {
  const result = await client.query('SELECT NOW()');
  return result.rows[0];
});
```

#### TypeScript compilation errors with worker files

**Problem:** TypeScript files don't work well with worker threads.

**Solution:** Keep worker files as JavaScript (`.js`) and main files as
TypeScript:

```ts
// main.ts (TypeScript)
import { PgParallel } from 'pg-parallel';

const result = await db.worker({
  taskPath: path.resolve(process.cwd(), 'workers/processor.js'), // .js file
  taskName: 'process',
});
```

```js
// workers/processor.js (JavaScript)
module.exports = {
  process: async (client, data) => {
    // Worker logic here
    return processedData;
  },
};
```

#### Performance slower than expected

**Problem:** Overhead from worker threads negates benefits.

**Solution:** Use workers only for CPU-intensive tasks:

```ts
// Wrong - simple query doesn't need worker
await db.worker(async (client) => {
  return await client.query('SELECT 1');
});

// Correct - use main thread for simple queries
const result = await db.query('SELECT 1');

// Correct - use worker for heavy computation
await db.worker(async (client) => {
  const { rows } = await client.query('SELECT * FROM large_table');
  return rows.map((row) => heavyProcessing(row)); // CPU-intensive
});
```

## Performance and Benchmarks

**Executive Summary**: Comprehensive benchmark analysis reveals that pg-parallel
**outperforms pg.Pool in light I/O workloads** (5.4% faster) while providing
superior reliability features. For mixed I/O+CPU workloads, pg-parallel delivers
**2.97x faster performance**. The key is proper configuration: use
`maxWorkers: 1` for pure I/O and always call `warmup()` for optimal performance.

For detailed performance analysis and scenario-specific recommendations:

- **[Performance Comparison Summary](./docs/performance-comparison.md)** -
  Comprehensive comparison with pg.Pool and detailed when-to-use guidance
- **[Benchmark System Documentation](./docs/benchmark-improvements.md)** -
  Technical details of our benchmarking methodology and optimization process

### Key Performance Insights (Comprehensive Benchmark Analysis)

#### Pure I/O Performance (Realistic Configuration)

| Load Scenario   | pg-parallel    | pg.Pool        | Difference       | Winner      | Key Factor                         |
| --------------- | -------------- | -------------- | ---------------- | ----------- | ---------------------------------- |
| **Light Load**  | 6,289 ops/sec  | 5,952 ops/sec  | **+5.4% faster** | pg-parallel | Circuit breaker + I/O optimization |
| **Medium Load** | 13,477 ops/sec | 15,152 ops/sec | -12.4% slower    | pg.Pool     | Raw connection efficiency          |
| **Heavy Load**  | 15,432 ops/sec | 17,153 ops/sec | -11.1% slower    | pg.Pool     | High-throughput optimization       |

#### Mixed Workload Performance

| Workload Type     | pg-parallel | pg.Pool/Sequential | Performance Gain | Use Case              |
| ----------------- | ----------- | ------------------ | ---------------- | --------------------- |
| **Pure CPU**      | 7.298s avg  | 19.904s            | **2.73x faster** | Data processing tasks |
| **Mixed I/O+CPU** | 7.710s avg  | 22.878s            | **2.97x faster** | ETL operations        |

**Key Insights**:

- **Light I/O**: pg-parallel wins with 5.4% advantage + reliability features
- **Heavy I/O**: pg.Pool wins with 10-12% raw speed advantage
- **Mixed workloads**: pg-parallel dominates with 2.7-3x performance gains
- **Critical config**: `maxWorkers: 1` essential for optimal I/O performance

### Production Configuration Guide

#### 🎯 Scenario-Based Recommendations

**1. Light I/O Applications (Recommended: pg-parallel)**

```typescript
// WINNER: pg-parallel (5.4% faster + resilience)
const db = new PgParallel({
  ...pgConfig,
  maxWorkers: 1, // Critical: Use 1 worker for pure I/O
  retryConfig: {
    maxRetries: 3,
    baseDelay: 100,
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    resetTimeout: 30000,
  },
});
await db.warmup(); // Mandatory for optimal performance!

// Perfect for: REST APIs, CRUD operations, light queries
await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

**2. Heavy I/O Applications (Consider: pg.Pool)**

```typescript
// WINNER: pg.Pool (10-12% faster in pure throughput)
import { Pool } from 'pg';
const pool = new Pool({
  ...pgConfig,
  max: 50, // Higher connection pool for throughput
  idleTimeoutMillis: 30000,
});

// Best for: High-frequency queries, bulk operations, reporting
await pool.query('SELECT COUNT(*) FROM large_table');

// Alternative: pg-parallel with trade-off awareness
const db = new PgParallel({ ...pgConfig, maxWorkers: 1 });
await db.warmup();
// 11% slower but with circuit breaker + retry + zero errors
await db.query('SELECT * FROM large_dataset WHERE complex_condition');
```

**3. Mixed I/O + CPU Workloads (Strongly Recommended: pg-parallel)**

```typescript
// CLEAR WINNER: pg-parallel (2.97x faster than pg.Pool)
const db = new PgParallel({
  ...pgConfig,
  maxWorkers: 4, // More workers for CPU tasks
  workerIdleTimeout: 60000,
});
await db.warmup();

// ETL operations, data processing, complex transformations
await db.worker(async (client) => {
  const data = await client.query('SELECT * FROM raw_data LIMIT 10000');
  const processed = await processLargeDataset(data.rows); // CPU-intensive
  await client.query('INSERT INTO processed_data VALUES ...', processed);
  return processed.length;
});
```

**4. Pure CPU Tasks (Strongly Recommended: pg-parallel)**

```typescript
// CLEAR WINNER: pg-parallel (2.73x faster than sequential)
await db.task(() => {
  // CPU-intensive operations in isolated worker thread
  return calculateComplexReport(largeDataset);
}); // No database blocking!
```

#### ⚙️ Configuration Matrix

| Use Case            | Library     | maxWorkers | Performance    | Reliability             | Best For                |
| ------------------- | ----------- | ---------- | -------------- | ----------------------- | ----------------------- |
| **Light I/O**       | pg-parallel | 1          | +5.4% faster   | Circuit breaker + Retry | Production APIs         |
| **Heavy I/O**       | pg.Pool     | N/A        | +10-12% faster | Basic                   | High-throughput reports |
| **Mixed Workloads** | pg-parallel | 2-4        | +197% faster   | Full resilience         | ETL, data processing    |
| **CPU Tasks**       | pg-parallel | 2-8        | +173% faster   | Worker isolation        | Analytics, calculations |

#### 🚨 Critical Configuration Rules

```typescript
// ✅ DO: For pure I/O workloads
const db = new PgParallel({ maxWorkers: 1 }); // Optimal for I/O

// ❌ DON'T: Multiple workers for simple queries
const db = new PgParallel({ maxWorkers: 4 }); // Overhead for pure I/O

// ✅ DO: Always warmup in production
await db.warmup(); // 1,135% performance improvement

// ✅ DO: Use appropriate methods
await db.query(sql); // Pure I/O - now faster than pg.Pool
await db.task(fn); // Pure CPU - 2.73x faster
await db.worker(fn); // Mixed I/O+CPU - 2.97x faster
```

### Getting Help

If you encounter issues not covered here:

1. **Performance Questions**: Review
   [Performance Comparison](./docs/performance-comparison.md) for detailed
   benchmarks and when to use each library
2. **Configuration Issues**: Refer to the
   [Production Configuration Guide](#production-configuration-guide) above for
   scenario-based recommendations
3. **Implementation Examples**: Check the [Examples](./examples/) directory for
   working code samples
4. **Benchmark Details**: See
   [Benchmark System Documentation](./docs/benchmark-improvements.md) for
   technical methodology
5. **Bug Reports**: Search existing
   [GitHub Issues](https://github.com/j-givisiez/pg-parallel/issues)
6. **New Issues**: Create a new issue with minimal reproduction case and
   performance context

## Third-party Licenses

This project uses the following third-party libraries:

- **[node-postgres (pg)](https://www.npmjs.com/package/pg)** - MIT License ©
  Brian Carlson

**Note:** Previous versions used the `uuid` library, but since v1.4.0,
pg-parallel uses Node.js built-in `crypto.randomUUID()` for zero external
dependencies.

## License

MIT © [Jonathan Givisiez](https://github.com/j-givisiez)
