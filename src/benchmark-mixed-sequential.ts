import 'dotenv/config';
import { Pool } from 'pg';

const TOTAL_REQUESTS_MIXED = 8;
const TOTAL_MAX_CLIENTS = 100;
const CPU_COMPLEXITY = 42;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const pgPoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
};

const fibonacciTask = function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

const benchmarkMixedSequential = async () => {
  const pool = new Pool(pgPoolConfig);
  const startTime = Date.now();
  await Promise.all(
    Array.from({ length: TOTAL_REQUESTS_MIXED }, async () => {
      const { rows } = await pool.query("SELECT 'Test User' as name");
      fibonacciTask(CPU_COMPLEXITY);
    }),
  );
  console.log(`pg.Pool (baseline):    ${(Date.now() - startTime) / 1000}s`);
  await pool.end();
};

benchmarkMixedSequential().catch(console.error);
