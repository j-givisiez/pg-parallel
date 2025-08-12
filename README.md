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
  - [Complex Worker Logic](#complex-worker-logic)
  - [Self-Contained Functions](#self-contained-functions)
- [Performance](#performance)
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
const { v4: uuidv4 } = require('uuid');

module.exports = {
  generateReport: async (client, reportType = 'summary') => {
    const { rows } = await client.query(
      "SELECT * FROM (SELECT 1 as id, 'Sample Data' as name) as sales_data",
    );

    // Generate unique report ID using imported uuid
    const reportId = uuidv4();

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
    const taskId = uuidv4();
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

## Performance

Performance benchmarks demonstrate when `pg-parallel` provides benefits over
standard `pg.Pool`. These tests were conducted on Apple M1 (8 cores) with
PostgreSQL 15.

### Benchmark Overview

| Scenario                         | pg-parallel | Baseline    | Improvement       |
| -------------------------------- | ----------- | ----------- | ----------------- |
| **Pure I/O** (10,000 queries)    | 0.449s avg  | 0.399s avg  | **-12.5% slower** |
| **Pure CPU** (8 fibonacci tasks) | 6.713s avg  | 19.741s avg | **2.94x faster**  |
| **Mixed I/O + CPU** (8 tasks)    | 7.312s avg  | 22.424s avg | **3.07x faster**  |

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

- **Overhead**: Approximately 12.5% slower than `pg.Pool` for pure I/O
  operations
- **Cause**: Additional abstraction layer and worker management overhead
- **Recommendation**: Use `pg.Pool` directly for simple database queries

#### CPU-Intensive Tasks

- **Speedup**: Consistently 2.9x to 3.1x faster than sequential processing
- **Benefit**: Main thread remains responsive during heavy computations
- **Scalability**: Performance scales with CPU core count

#### Mixed Workloads

- **Optimal Use Case**: Complex transactions with both I/O and CPU work
- **Real-world Example**: ETL processes, data analysis, report generation
- **Event Loop**: Remains unblocked for handling other requests

### Performance Guidelines

**Use `pg-parallel` when:**

- CPU tasks take > 100ms per operation
- You need to maintain application responsiveness
- Processing large datasets with complex logic
- Running multiple parallel operations

**Avoid `pg-parallel` when:**

- Simple CRUD operations
- CPU tasks take < 10ms per operation
- Memory usage is a primary concern
- Single-threaded environment preferred

### Benchmark Methodology

All benchmarks use:

- PostgreSQL 15.3 running locally
- Node.js 18.17.0
- Apple M1 processor (8 cores)
- Fibonacci(40) as CPU-intensive task
- Average of 30 runs (10 runs x 3 executions) for high precision

## When to Use

**Use `pg-parallel` when your application:**

- Performs CPU-intensive calculations (data analysis, image processing)
- Runs complex database transactions with heavy logic
- Needs to maintain responsiveness under mixed workloads

**Stick with `pg` when:**

- Only performing simple I/O database queries
- No CPU-intensive operations needed

## Troubleshooting

### Common Issues

#### "require is not defined" in worker functions

**Problem:** Using `require()` inside function-based workers fails.

**Solution:** Use file-based workers instead:

```ts
// Wrong - this will fail
await db.worker(async (client) => {
  const uuid = require('uuid'); // Error: require is not defined
  // ...
});

// Correct - use file-based workers
await db.worker({
  taskPath: path.resolve(__dirname, 'tasks/my-worker.js'),
  taskName: 'processData',
});
```

#### "All workers are busy" errors

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

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/j-givisiez/pg-parallel/issues)
2. Review the [examples directory](./examples/) for working code
3. Open a new issue with a minimal reproduction case

## Third-party Licenses

This project uses the following third-party libraries:

- **[node-postgres (pg)](https://www.npmjs.com/package/pg)** - MIT License ©
  Brian Carlson
- **[uuid](https://www.npmjs.com/package/uuid)** - MIT License

## License

MIT © [Jonathan Givisiez](https://github.com/j-givisiez)
