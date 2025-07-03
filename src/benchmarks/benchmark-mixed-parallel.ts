import 'dotenv/config';
import { cpus } from 'os';
import { PgParallel } from '../pg-parallel';

const TOTAL_REQUESTS_MIXED = 8;
const TOTAL_MAX_CLIENTS = 100;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const pgParallelConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
  maxWorkers: cpus().length,
};

const benchmarkMixedParallel = async () => {
  console.log(`\n--- Running Mixed I/O + CPU Benchmark (${TOTAL_REQUESTS_MIXED} tasks) ---`);

  const db = new PgParallel(pgParallelConfig);
  const startTime = Date.now();
  await Promise.all(
    Array.from({ length: TOTAL_REQUESTS_MIXED }, () =>
      db.worker(async (client) => {
        const CPU_COMPLEXITY = 42;
        const fibonacciTask = function fib(n: number): number {
          if (n <= 1) return n;
          return fib(n - 1) + fib(n - 2);
        };
        const { rows } = await client.query("SELECT 'Test User' as name");
        fibonacciTask(CPU_COMPLEXITY);
      }),
    ),
  );
  console.log(`pg-parallel (.worker): ${(Date.now() - startTime) / 1000}s`);
  await db.shutdown();
};

benchmarkMixedParallel().catch(console.error);
