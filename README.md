# pg-parallel

[![npm version](https://img.shields.io/npm/v/pg-parallel.svg)](https://www.npmjs.com/package/pg-parallel)
[![Node.js version](https://img.shields.io/node/v/pg-parallel.svg)](https://nodejs.org/en/)
[![TypeScript](https://img.shields.io/badge/TypeScript-compatible-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/pg-parallel)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/j-givisiez/pg-parallel/actions/workflows/ci.yml/badge.svg)](https://github.com/j-givisiez/pg-parallel/actions)

**[View on npm](https://www.npmjs.com/package/pg-parallel) ·
[View on GitHub](https://github.com/j-givisiez/pg-parallel)**

> Non-blocking PostgreSQL for Node.js with worker thread support

A specialized wrapper around `node-postgres` that prevents event-loop blocking
by offloading heavy CPU tasks and complex transactions to worker threads.

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
- Node.js v18.20.4 or higher

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
const result = await db.task(
  (n) => {
    // Heavy computation here
    return n * n;
  },
  [42],
);

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

The `config` object extends `pg.PoolConfig` with one additional property:

- `maxWorkers?: number` - Number of worker threads (defaults to
  `os.cpus().length`)

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
const fibonacci = (n: number) => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

const result = await db.task(fibonacci, [40]);
```

#### `db.worker(task)`

Execute database operations and CPU-intensive logic in worker threads with
dedicated client connection.

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

**Note:** No manual `client.release()` needed - lifecycle is managed
automatically.

#### `db.shutdown()`

Gracefully shut down all connections and terminate workers.

```ts
await db.shutdown();
```

## Advanced Usage

### Complex Worker Logic

For production code, organize worker logic in separate files:

```ts
// tasks/report-worker.js
const PDFDocument = require('pdfkit');

module.exports = {
  generateReport: (data) => {
    const doc = new PDFDocument();
    doc.text(`Report for ${data.length} records`);
    doc.end();
    return 'Report generated';
  },
};

// main.js
const path = require('path');

await db.worker(async (client) => {
  const taskPath = path.resolve(__dirname, 'tasks/report-worker.js');
  const { generateReport } = require(taskPath);

  const { rows } = await client.query('SELECT * FROM sales_data');
  return generateReport(rows);
});
```

### Self-Contained Functions

Functions passed to `db.task()` and `db.worker()` must be self-contained (no
access to parent scope):

```ts
// ❌ Wrong - references parent scope
const TAX_RATE = 0.07;
await db.task((price) => price * (1 + TAX_RATE), [100]);

// ✅ Correct - self-contained
await db.task(
  (price) => {
    const TAX_RATE = 0.07;
    return price * (1 + TAX_RATE);
  },
  [100],
);
```

## Performance

Benchmark results on Apple M1 (8 cores).

### Test Run 1

```sh
Pure I/O (10,000 requests):
pg-parallel (.query): 0.547s
pg.Pool (baseline):   0.383s

Pure CPU (8 tasks):
pg-parallel (.task):  7.317s
Sequential:           19.532s

Mixed I/O + CPU (8 tasks):
pg-parallel (.worker): 6.914s
Sequential:            19.741s
```

### Test Run 2

```sh
Pure I/O (10,000 requests):
pg-parallel (.query): 0.512s
pg.Pool (baseline):   0.422s

Pure CPU (8 tasks):
pg-parallel (.task):  6.785s
Sequential:           19.563s

Mixed I/O + CPU (8 tasks):
pg-parallel (.worker): 7.253s
Sequential:            19.857s
```

### Test Run 3

```sh
Pure I/O (10,000 requests):
pg-parallel (.query): 0.515s
pg.Pool (baseline):   0.411s

Pure CPU (8 tasks):
pg-parallel (.task):  6.906s
Sequential:           19.487s

Mixed I/O + CPU (8 tasks):
pg-parallel (.worker): 6.949s
Sequential:            19.731s
```

**Key insights:**

- **I/O Overhead**: The overhead for direct I/O queries ranges from ~21% to ~43%
  compared to the baseline `pg.Pool`.
- **CPU-Intensive Tasks**: Parallel execution is consistently **2.7x to 2.9x
  faster** than sequential processing.
- **Mixed Workloads**: Workloads with both I/O and CPU operations see a similar
  speedup of **2.7x to 2.9x**.
- **Event Loop**: The main event loop remains unblocked and responsive during
  heavy computations across all tests.

## When to Use

**Use `pg-parallel` when your application:**

- Performs CPU-intensive calculations (data analysis, image processing)
- Runs complex database transactions with heavy logic
- Needs to maintain responsiveness under mixed workloads

**Stick with `pg` when:**

- Only performing simple I/O database queries
- No CPU-intensive operations needed

## Third-party Licenses

This project uses the following third-party libraries:

- **[node-postgres (pg)](https://www.npmjs.com/package/pg)** - MIT License ©
  Brian Carlson
- **[uuid](https://www.npmjs.com/package/uuid)** - MIT License

## License

MIT © [Jonathan Givisiez](https://github.com/j-givisiez)
