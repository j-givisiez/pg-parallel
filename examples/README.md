# `pg-parallel` Usage Examples

Welcome! This directory contains functional examples to help you understand and
use the core features of `pg-parallel`. Each example is self-contained and
designed to be easy to run.

## 🚀 Getting Started: 3-Step Setup

Follow these three steps to get the examples running on your local machine.

### Step 1: Set Up Your Database

Before you begin, you need:

1.  A running PostgreSQL server.
2.  A database for the examples. You can create one using `createdb`:
    ```bash
    createdb pg_parallel_examples
    ```
    We will use `pg_parallel_examples` as the database name in the following
    steps.

### Step 2: Configure Your Environment

The examples use a `.env` file to connect to your database.

1.  Create a new file named `.env` in the root of the project (at the same level
    as `package.json`).
2.  Add your database connection string to it. It should look like this:

    ```sh
    # .env file
    DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/pg_parallel_examples"
    ```

    > **Note:** Replace `YOUR_USER` and `YOUR_PASSWORD` with your own PostgreSQL
    > credentials.

### Step 3: Create Tables and Seed Data

Now, run the provided SQL script to create the necessary tables (`users`,
`raw_events`, etc.) and fill them with sample data.

From the project root, run this command in your terminal:

```bash
psql -U YOUR_USER -d pg_parallel_examples -f examples/setup.sql
```

> You will be prompted for your password. Once complete, you should see a
> "Database setup complete" message.

You are all set!

---

## ▶️ Running the Examples

Each example can be run from the project root using `ts-node`.

### Example 1: Basic I/O Query

Demonstrates a simple database query on the main thread.

**Command:**

```bash
ts-node examples/01-basic-query.ts
```

**Expected Output:**

```sh
Running Example 1: Basic Query
Query successful: Fetched users
┌─────────┬───┬─────────┬─────────────────────────┐
│ (index) │id │  name   │          email          │
├─────────┼───┼─────────┼─────────────────────────┤
│    0    │ 1 │ 'Alice' │ 'alice@example.com'     │
│    1    │ 2 │  'Bob'  │  'bob@example.com'      │
│   ...   │...│   ...   │           ...           │
└─────────┴───┴─────────┴─────────────────────────┘
Database connection shut down
```

### Example 2: CPU-Intensive Task

Shows how `db.task()` offloads heavy work to a worker, keeping the main thread
free.

**Command:**

```bash
ts-node examples/02-cpu-intensive-task.ts
```

**Expected Output:**

```sh
Running Example 2: CPU-Intensive Task
Event loop is not blocked (Tick 1)
Offloading a heavy CPU task (Fibonacci of 40) to a worker
Event loop is not blocked (Tick 2)
...
CPU task completed in worker: Result 102334155
Workers and database connection shut down
```

### Example 3: Mixed Workload (ETL)

Simulates a real-world ETL process running in a worker with `db.worker()`.

**Command:**

```bash
ts-node examples/03-mixed-workload-etl.ts
```

**Expected Output:**

```sh
Running Example 3: Mixed Workload (ETL)
Offloading ETL process to a worker
[Worker] Starting ETL process
[Worker] Transaction started
[Worker] Extracted 4 new events
[Worker] Transaction committed successfully

ETL process completed: Processed 4 events
Workers and database connection shut down
```

---

If you have any questions, feel free to open an issue in the repository. Happy
coding!
