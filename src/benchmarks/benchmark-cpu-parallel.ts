import 'dotenv/config';
import { cpus } from 'os';
import { PgParallel } from '../pg-parallel';

const TOTAL_REQUESTS_CPU = 8;
const TOTAL_MAX_CLIENTS = 100;
const CPU_COMPLEXITY = 42;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const pgParallelConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
  maxWorkers: cpus().length,
};

const fibonacciTask = function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

const runParallel = async () => {
  console.log(`\n--- Running Pure CPU Benchmark (${TOTAL_REQUESTS_CPU} tasks) ---`);
  const db = new PgParallel(pgParallelConfig);
  await db.warmup();
  const startTime = Date.now();
  await Promise.all(Array.from({ length: TOTAL_REQUESTS_CPU }, () => db.task(fibonacciTask, [CPU_COMPLEXITY])));
  console.log(`pg-parallel (.task): ${(Date.now() - startTime) / 1000}s`);
  await db.shutdown();
};

runParallel().catch(console.error);
