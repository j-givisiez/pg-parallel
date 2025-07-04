import 'dotenv/config';
import { Pool } from 'pg';
import { PgParallel } from '../pg-parallel';

const TOTAL_REQUESTS_IO = 10000;
const TOTAL_MAX_CLIENTS = 100;
const TOTAL_RUNS = 10;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pgParallelConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
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
 * Executes a single I/O benchmark run for pg-parallel
 * @param db PgParallel instance to test
 * @returns Execution time in seconds
 */
const runPgParallelBenchmark = async (db: PgParallel): Promise<number> => {
  const startTime = Date.now();
  await Promise.all(Array.from({ length: TOTAL_REQUESTS_IO }, () => db.query('SELECT 1')));
  return (Date.now() - startTime) / 1000;
};

/**
 * Executes a single I/O benchmark run for pg.Pool
 * @param pool Pool instance to test
 * @returns Execution time in seconds
 */
const runPgPoolBenchmark = async (pool: Pool): Promise<number> => {
  const startTime = Date.now();
  await Promise.all(Array.from({ length: TOTAL_REQUESTS_IO }, () => pool.query('SELECT 1')));
  return (Date.now() - startTime) / 1000;
};

/**
 * Runs multiple I/O benchmark iterations and displays statistics
 */
const benchmarkIoMultipleRuns = async () => {
  console.log(`--- Running Pure I/O Benchmark (${TOTAL_RUNS} runs of ${TOTAL_REQUESTS_IO} requests each) ---`);

  const pgParallelTimes: number[] = [];
  const pgPoolTimes: number[] = [];

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    console.log(`\nRun ${i}/${TOTAL_RUNS}:`);

    const pool = new Pool(pgPoolConfig);
    const pgPoolTime = await runPgPoolBenchmark(pool);
    pgPoolTimes.push(pgPoolTime);
    console.log(`  pg.Pool (baseline):   ${pgPoolTime.toFixed(3)}s`);
    await pool.end();

    const db = new PgParallel(pgParallelConfig);
    const pgParallelTime = await runPgParallelBenchmark(db);
    pgParallelTimes.push(pgParallelTime);
    console.log(`  pg-parallel (.query): ${pgParallelTime.toFixed(3)}s`);
    await db.shutdown();
  }

  const pgParallelStats = calculateStats(pgParallelTimes);
  const pgPoolStats = calculateStats(pgPoolTimes);

  console.log('\n=== STATISTICS ===');
  console.log('\npg-parallel (.query):');
  console.log(`  Average: ${pgParallelStats.avg.toFixed(3)}s`);
  console.log(`  Min:     ${pgParallelStats.min.toFixed(3)}s`);
  console.log(`  Max:     ${pgParallelStats.max.toFixed(3)}s`);
  console.log(`  StdDev:  ${pgParallelStats.stdDev.toFixed(3)}s`);

  console.log('\npg.Pool (baseline):');
  console.log(`  Average: ${pgPoolStats.avg.toFixed(3)}s`);
  console.log(`  Min:     ${pgPoolStats.min.toFixed(3)}s`);
  console.log(`  Max:     ${pgPoolStats.max.toFixed(3)}s`);
  console.log(`  StdDev:  ${pgPoolStats.stdDev.toFixed(3)}s`);

  const improvement = ((pgPoolStats.avg - pgParallelStats.avg) / pgPoolStats.avg) * 100;
  console.log(`\nAverage Performance: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}% vs pg.Pool`);
};

benchmarkIoMultipleRuns().catch(console.error);
