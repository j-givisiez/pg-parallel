# pg-parallel

[![npm version](https://img.shields.io/npm/v/pg-parallel.svg)](https://www.npmjs.com/package/pg-parallel)
[![Node.js version](https://img.shields.io/node/v/pg-parallel.svg)](https://nodejs.org/en/)
[![TypeScript](https://img.shields.io/badge/TypeScript-compatible-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/npm/l/pg-parallel.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/j-givisiez/pg-parallel/actions/workflows/ci.yml/badge.svg)](https://github.com/j-givisiez/pg-parallel/actions)

**[View on npm](https://www.npmjs.com/package/pg-parallel) · [View on GitHub](https://github.com/j-givisiez/pg-parallel)**

> Non-blocking PostgreSQL for Node.js with worker thread support

A specialized wrapper around `node-postgres` that prevents event-loop blocking by offloading heavy CPU tasks and complex transactions to worker threads.

## Features

- **Hybrid Architecture**: Fast I/O on main thread, heavy work on workers
- **Zero Overhead**: Standard queries use main thread pool directly
- **Automatic Management**: No manual `client.release()` needed
- **TypeScript Support**: Full type safety with comprehensive interfaces
- **Lazy Initialization**: Workers spawned only when needed
- **Graceful Shutdown**: Proper resource cleanup

## Installation

```bash
npm install pg-parallel pg
```

**Note:** `pg` is a peer dependency and must be installed alongside `pg-parallel`.

## Dependencies

This library is built on top of [node-postgres (pg)](https://www.npmjs.com/package/pg), a non-blocking PostgreSQL client for Node.js. The `pg` package is included as a peer dependency and must be installed alongside `pg-parallel`.

**Requirements:**

- `pg` v8.11.3+ (peer dependency)
- Node.js v15.14.0 or higher

---

## Quick Start

```ts
import { PgParallel } from "pg-parallel";

const db = new PgParallel({
  connectionString: "postgresql://user:pass@localhost/db",
  maxWorkers: 4, // Optional: defaults to CPU core count
});

// Standard I/O query (main thread)
const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [1]);

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
  const { rows } = await client.query("SELECT data FROM table");
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

- `maxWorkers?: number` - Number of worker threads (defaults to `os.cpus().length`)

### Methods

#### `db.query(config, values?)`

Execute standard I/O queries on the main thread pool.

```ts
// Simple query
const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [1]);

// With query config
const result = await db.query({
  text: "SELECT * FROM users WHERE active = $1",
  values: [true],
});
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

Execute database operations and CPU-intensive logic in worker threads with dedicated client connection.

```ts
// Simple example
const result = await db.worker(async (client) => {
  const { rows } = await client.query("SELECT 'value' as data");
  return rows[0].data.toUpperCase();
});

// Transaction example
await db.worker(async (client) => {
  await client.query("BEGIN");

  const { rows } = await client.query("UPDATE accounts SET balance = balance - 100 WHERE id = 1 RETURNING balance");

  if (rows[0].balance < 0) {
    throw new Error("Insufficient funds");
  }

  await client.query("UPDATE accounts SET balance = balance + 100 WHERE id = 2");
  await client.query("COMMIT");
});
```

**Note:** No manual `client.release()` needed - lifecycle is managed automatically.

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
const PDFDocument = require("pdfkit");

module.exports = {
  generateReport: (data) => {
    const doc = new PDFDocument();
    doc.text(`Report for ${data.length} records`);
    doc.end();
    return "Report generated";
  },
};

// main.js
const path = require("path");

await db.worker(async (client) => {
  const taskPath = path.resolve(__dirname, "tasks/report-worker.js");
  const { generateReport } = require(taskPath);

  const { rows } = await client.query("SELECT * FROM sales_data");
  return generateReport(rows);
});
```

### Self-Contained Functions

Functions passed to `db.task()` and `db.worker()` must be self-contained (no access to parent scope):

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

Benchmark results on Apple M1 (8 cores):

```sh
Pure I/O (10,000 requests):
pg-parallel (.query): 0.853s
pg.Pool (baseline):   0.483s

Pure CPU (8 tasks):
pg-parallel (.task):  7.618s
Sequential:           19.862s

Mixed I/O + CPU (8 tasks):
pg-parallel (.worker): 7.657s
Sequential:            19.774s
```

**Key insights:**

- Minimal overhead for I/O operations (~76% of baseline)
- **2.6x faster** for CPU-intensive tasks
- **2.6x faster** for mixed workloads
- Event loop remains responsive during heavy computation

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

- **[node-postgres (pg)](https://www.npmjs.com/package/pg)** - MIT License © Brian Carlson
- **[uuid](https://www.npmjs.com/package/uuid)** - MIT License

## License

MIT © [Jonathan Givisiez](https://github.com/j-givisiez)
