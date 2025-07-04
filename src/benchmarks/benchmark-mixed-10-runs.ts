import 'dotenv/config';
import { cpus } from 'os';
import { Pool } from 'pg';
import { PgParallel } from '../pg-parallel';

const TOTAL_REQUESTS_MIXED = 8;
const TOTAL_MAX_CLIENTS = 100;
const TOTAL_RUNS = 10;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pgParallelConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
  maxWorkers: cpus().length,
};

const pgPoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
};

/**
 * Calculates statistical metrics from an array of execution times
 * @param times Array of execution times in seconds
 * @returns Object containing min, max, average and standard deviation
 */
const calculateStats = (times: number[]) => {
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
  const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { min, max, avg, stdDev };
};

/**
 * Executes a single mixed I/O + CPU benchmark run for pg-parallel
 * @param db PgParallel instance to test
 * @returns Execution time in seconds
 */
const runPgParallelBenchmark = async (db: PgParallel): Promise<number> => {
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
        return rows[0];
      }),
    ),
  );
  return (Date.now() - startTime) / 1000;
};

/**
 * Executes a single mixed I/O + CPU benchmark run for pg.Pool
 * @param pool Pool instance to test
 * @returns Execution time in seconds
 */
const runPgPoolBenchmark = async (pool: Pool): Promise<number> => {
  const startTime = Date.now();
  await Promise.all(
    Array.from({ length: TOTAL_REQUESTS_MIXED }, async () => {
      const CPU_COMPLEXITY = 42;
      const fibonacciTask = function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      };
      const { rows } = await pool.query("SELECT 'Test User' as name");
      fibonacciTask(CPU_COMPLEXITY);
      return rows[0];
    }),
  );
  return (Date.now() - startTime) / 1000;
};

/**
 * Runs multiple mixed I/O + CPU benchmark iterations and displays statistics
 */
const benchmarkMixedMultipleRuns = async () => {
  console.log(`--- Running Mixed I/O + CPU Benchmark (${TOTAL_RUNS} runs of ${TOTAL_REQUESTS_MIXED} tasks each) ---`);

  const pgParallelTimes: number[] = [];
  const pgPoolTimes: number[] = [];

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    console.log(`\nRun ${i}/${TOTAL_RUNS}:`);

    const db = new PgParallel(pgParallelConfig);
    await db.warmup();
    const pgParallelTime = await runPgParallelBenchmark(db);
    pgParallelTimes.push(pgParallelTime);
    console.log(`  pg-parallel (.worker): ${pgParallelTime.toFixed(3)}s`);
    await db.shutdown();

    const pool = new Pool(pgPoolConfig);
    const pgPoolTime = await runPgPoolBenchmark(pool);
    pgPoolTimes.push(pgPoolTime);
    console.log(`  pg.Pool (baseline):    ${pgPoolTime.toFixed(3)}s`);
    await pool.end();
  }

  const pgParallelStats = calculateStats(pgParallelTimes);
  const pgPoolStats = calculateStats(pgPoolTimes);

  console.log('\n=== STATISTICS ===');
  console.log('\npg-parallel (.worker):');
  console.log(`  Average: ${pgParallelStats.avg.toFixed(3)}s`);
  console.log(`  Min:     ${pgParallelStats.min.toFixed(3)}s`);
  console.log(`  Max:     ${pgParallelStats.max.toFixed(3)}s`);
  console.log(`  StdDev:  ${pgParallelStats.stdDev.toFixed(3)}s`);

  console.log('\npg.Pool (baseline):');
  console.log(`  Average: ${pgPoolStats.avg.toFixed(3)}s`);
  console.log(`  Min:     ${pgPoolStats.min.toFixed(3)}s`);
  console.log(`  Max:     ${pgPoolStats.max.toFixed(3)}s`);
  console.log(`  StdDev:  ${pgPoolStats.stdDev.toFixed(3)}s`);

  const speedup = pgPoolStats.avg / pgParallelStats.avg;
  console.log(`\nAverage Performance: ${speedup.toFixed(2)}x faster than pg.Pool`);
};

benchmarkMixedMultipleRuns().catch(console.error);
