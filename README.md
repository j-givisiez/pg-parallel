# pg-parallel: Non-Blocking PostgreSQL for Node.js

[![npm version](https://img.shields.io/npm/v/pg-parallel.svg)](https://www.npmjs.com/package/pg-parallel)
[![Node.js version](https://img.shields.io/node/v/pg-parallel.svg)](https://nodejs.org/en/)
[![TypeScript](https://img.shields.io/badge/TypeScript-compatible-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/npm/l/pg-parallel.svg)](https://opensource.org/licenses/MIT)

**Never block your Node.js event loop again.**

`pg-parallel` is a specialized wrapper around `node-postgres` designed for Node.js applications that handle both standard database queries and CPU-intensive tasks. It prevents your server from becoming unresponsive by seamlessly offloading heavy work to a pool of `worker_threads`.

---

## When to use `pg-parallel`?

This library is for you if your application needs to:

- **Perform heavy, CPU-bound calculations** (e.g., data analysis, image/video processing, complex report generation) without blocking other requests.
- **Run complex database transactions** that involve CPU-intensive logic between queries.
- Maintain a responsive server under mixed workloads.

If your application only performs simple I/O database queries, the standard `pg` library is highly optimized and likely sufficient for your needs.

---

## How It Works

`pg-parallel` uses a hybrid model:

1.  **A Main Thread Pool**: A standard `pg.Pool` is used for fast, everyday I/O queries (`db.query`), providing familiar performance with zero overhead.
2.  **A Worker Thread Pool**: A pool of workers is initialized _lazily_ on demand. These workers are used to execute CPU-bound functions (`db.task`) or complex database transactions (`db.worker`), keeping the main event loop free.

This design gives you the best of both worlds: the raw speed of `node-postgres` for common tasks and true parallelism for heavy lifting.

---

## Installation

```bash
npm install pg-parallel pg
```

_Requires Node.js v15.14.0 or higher._

_Note: `pg` is a peer dependency and must be installed alongside._

---

## API & Best Practices

### `new PgParallel(config)`

Initializes the manager. The `config` object is a standard `pg.PoolConfig` object from `node-postgres`, with one extra optional property:

- `maxWorkers: number`: The number of worker threads to spawn for heavy tasks. Defaults to `os.cpus().length`.

---

### 1. For Heavy CPU-Bound Tasks: `db.task()`

This is the primary method for offloading pure CPU work. The provided function runs in a worker thread, ensuring the event loop remains unblocked.

**Use Case**: Image resizing, complex financial calculations, data compression.

```ts
const fibonacci = (n: number) => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

// The fibonacci function runs in a worker, not the main thread.
const result = await db.task(fibonacci, [40]); // Your server remains responsive.
```

_Note: The function passed to `db.task` must be self-contained. See the **A Note on Self-Contained Functions** section below for details._

---

### 2. For Complex Transactions & Mixed Loads: `db.worker()`

Use this method to execute a series of database operations and CPU-bound logic within a single, dedicated client connection inside a worker.

**Use Case**: A transaction where you fetch data, process it heavily, and then write the results back.

**Simple Example:**

```ts
const result = await db.worker(async (client) => {
  // This entire function runs inside a worker thread.
  const { rows } = await client.query("SELECT 'some_value' as config");
  const processed = rows[0].config.toUpperCase() + "_PROCESSED";

  // You can perform more complex logic here...
  return processed;
});

console.log(result); // Outputs: 'SOME_VALUE_PROCESSED'
```

**Transaction Example:**

The `db.worker` method is ideal for transactions, as it guarantees all commands run on the same client. If any query fails, the entire function throws an error, the `COMMIT` is never reached, and the database automatically rolls back the transaction.

```ts
await db.worker(async (client) => {
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "UPDATE accounts SET balance = balance - 100 WHERE id = 1 RETURNING balance",
    );

    if (rows[0].balance < 0) {
      // Custom application-level error
      throw new Error("Insufficient funds");
    }

    await client.query("UPDATE accounts SET balance = balance + 100 WHERE id = 2");

    await client.query("COMMIT");
    console.log("Transaction successful!");
  } catch (e) {
    // No need to call ROLLBACK, the database handles it automatically on connection drop or error.
    console.error("Transaction failed:", e.message);
    // Re-throw the error to ensure the calling code knows the transaction failed.
    throw e;
  }
});
```

_Notice that `client.release()` is not required. `pg-parallel` automatically manages the client's lifecycle within the `db.worker` scope, ensuring it is always returned to the pool after your function completes._

_Just like `db.task`, the function passed to `db.worker` must be self-contained. See the **A Note on Self-Contained Functions** section below for details._

---

#### Organizing Complex Worker Logic (Advanced)

For any non-trivial task, writing logic directly inside the `db.worker` call is not practical. The recommended approach for production code is to define your worker logic in its own file and load it using `require()`.

This keeps your code clean, but introduces one important challenge: **Path Resolution**.

The path to your task file must be relative to your **final compiled Javascript output** (e.g., your `dist` folder), not your source `.ts` file. Using an absolute path is the safest way to ensure the worker can find your module.

**Example Structure:**

Imagine your final compiled output (`dist`) looks like this:

```
dist/
├── api/
│   └── server.js       # Your API code that calls db.worker
└── tasks/
    └── report-worker.js  # Your self-contained task logic
```

**Task File (`dist/tasks/report-worker.js`):**

```javascript
// This file is plain JavaScript and uses CommonJS modules.
// It can have its own require() statements for its dependencies, like pdfkit.
const PDFDocument = require("pdfkit");

module.exports = {
  generateReport: (salesData) => {
    // Heavy logic goes here...
    // Example: creating a PDF in memory
    const doc = new PDFDocument();
    doc.text(`Report for ${salesData.length} records.`);
    // ... add tables, charts, etc.
    doc.end();

    // In a real app, you might return the PDF buffer.
    // For this example, we just return a success message.
    return `Generated PDF report for ${salesData.length} records.`;
  },
};
```

**API Code (running from `dist/api/server.js`):**

```ts
const path = require("path");

await db.worker(async (client) => {
  // `__dirname` is the directory of the currently executing file (dist/api).
  // We build a reliable, absolute path to our task module from there.
  const taskPath = path.resolve(__dirname, "../tasks/report-worker.js");
  const { generateReport } = require(taskPath);

  const { rows } = await client.query("SELECT * FROM sales_data_for_q3");
  const report = generateReport(rows);

  // ... rest of the transaction
  console.log(report);
  return { success: true };
});
```

This pattern ensures your worker can always locate its logic, regardless of where you run the application from.

---

### 3. For Standard I/O Queries: `db.query()`

For all your simple, non-blocking database queries. This method uses the high-performance main-thread pool directly. It has the same signature as `pg.Pool.query()`.

**Use Case**: Standard `SELECT`, `INSERT`, `UPDATE`, `DELETE` operations in your API endpoints.

```ts
// db is an instance of PgParallel
const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [1]);
console.log("User:", rows[0]);
```

_Similar to `db.worker`, you don't need to worry about `client.release()`. The underlying `pg.Pool` on the main thread handles the entire client lifecycle (checkout and release) for you automatically when you use this method._

The overhead of using `db.query()` is minimal, making it a safe default for all your simple, non-blocking database queries.

## Benchmark Results

Here are the results from running the benchmark suite (`npm run benchmark`) on an Apple M1 machine. These results demonstrate the performance characteristics of each API method in its ideal use case.

```sh
==========================================================
Starting Benchmarks
CPU: Apple M1 (8 cores)
Memory: 8.00 GB
==========================================================

Running Pure I/O Benchmark...
--- Running Pure I/O Benchmark (10000 requests) ---
pg-parallel (.query): 0.853s
pg.Pool (baseline):   0.483s

Running Pure CPU Benchmark (Parallel)...

--- Running Pure CPU Benchmark (8 tasks) ---
pg-parallel (.task): 7.618s

Running Pure CPU Benchmark (Sequential)...
Sequential (baseline): 19.862s

Running Mixed I/O + CPU Benchmark (Parallel)...

--- Running Mixed I/O + CPU Benchmark (8 tasks) ---
pg-parallel (.worker): 7.657s

Running Mixed I/O + CPU Benchmark (Sequential)...
pg.Pool (baseline):    19.774s

All benchmarks completed successfully.
```

---

## A Note on Self-Contained Functions

**This is a critical concept for using `pg-parallel` correctly.**

When you pass a function to `db.task()` or `db.worker()`, it is serialized, sent to a separate `worker_thread`, and executed in a new context. This means **the function loses access to its original scope**. It cannot "see" any variables, helpers, or imports defined outside of its own body.

To avoid errors like `myVar is not defined`, your function must be **self-contained**.

- **Don't Use Closures:** Do not reference variables from the parent scope. Pass all necessary data as arguments to the task.
- **Import Inside:** All modules must be loaded with `require()` or `import()` _inside_ the function.
- **Define Helpers Inside:** Any helper functions must be defined _inside_ the main function.

#### Example

**Incorrect (will fail):**

```ts
const TAX_RATE = 0.07; // Defined in parent scope
const someHelper = (value) => value * 2; // Defined in parent scope

// This WILL FAIL because `TAX_RATE` and `someHelper` do not exist in the worker's scope.
await db.task(
  (price) => {
    const withTax = price * (1 + TAX_RATE);
    return someHelper(withTax);
  },
  [100],
);
```

**Correct (self-contained):**

```ts
await db.task(
  (price) => {
    // All dependencies are defined INSIDE the function.
    const TAX_RATE = 0.07;
    const someHelper = (value) => value * 2;

    const withTax = price * (1 + TAX_RATE);
    return someHelper(withTax);
  },
  [100],
);
```

For organizing more complex logic, refer to the code organization pattern in the `db.worker()` section.

---

## Graceful Shutdown

Always call `db.shutdown()` when your application is shutting down to release all connections and terminate the workers.

```ts
await db.shutdown();
```

---

## License

MIT © [Jonathan Givisiez](https://github.com/j-givisiez)
