import 'dotenv/config';
import { cpus } from 'os';
import { PgParallel } from '../pg-parallel';

const TOTAL_REQUESTS_CPU = 8;
const TOTAL_MAX_CLIENTS = 100;
const CPU_COMPLEXITY = 42;
const TOTAL_RUNS = 10;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pgParallelConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
  maxWorkers: cpus().length,
};

/**
 * Calculates Fibonacci number recursively for CPU-intensive benchmarking
 * @param n The Fibonacci number to calculate
 * @returns The calculated Fibonacci value
 */
const fibonacciTask = function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
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
 * Executes a single CPU benchmark run for pg-parallel
 * @param db PgParallel instance to test
 * @returns Execution time in seconds
 */
const runPgParallelBenchmark = async (db: PgParallel): Promise<number> => {
  const startTime = Date.now();
  await Promise.all(Array.from({ length: TOTAL_REQUESTS_CPU }, () => db.task(fibonacciTask, [CPU_COMPLEXITY])));
  return (Date.now() - startTime) / 1000;
};

/**
 * Executes a single CPU benchmark run sequentially
 * @returns Execution time in seconds
 */
const runSequentialBenchmark = (): number => {
  const startTime = Date.now();
  for (let i = 0; i < TOTAL_REQUESTS_CPU; i++) {
    fibonacciTask(CPU_COMPLEXITY);
  }
  return (Date.now() - startTime) / 1000;
};

/**
 * Runs multiple CPU benchmark iterations and displays statistics
 */
const benchmarkCpuMultipleRuns = async () => {
  console.log(`--- Running Pure CPU Benchmark (${TOTAL_RUNS} runs of ${TOTAL_REQUESTS_CPU} tasks each) ---`);

  const pgParallelTimes: number[] = [];
  const sequentialTimes: number[] = [];

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    console.log(`\nRun ${i}/${TOTAL_RUNS}:`);

    const db = new PgParallel(pgParallelConfig);
    await db.warmup();
    const pgParallelTime = await runPgParallelBenchmark(db);
    pgParallelTimes.push(pgParallelTime);
    console.log(`  pg-parallel (.task): ${pgParallelTime.toFixed(3)}s`);
    await db.shutdown();

    const sequentialTime = runSequentialBenchmark();
    sequentialTimes.push(sequentialTime);
    console.log(`  Sequential (baseline): ${sequentialTime.toFixed(3)}s`);
  }

  const pgParallelStats = calculateStats(pgParallelTimes);
  const sequentialStats = calculateStats(sequentialTimes);

  console.log('\n=== STATISTICS ===');
  console.log('\npg-parallel (.task):');
  console.log(`  Average: ${pgParallelStats.avg.toFixed(3)}s`);
  console.log(`  Min:     ${pgParallelStats.min.toFixed(3)}s`);
  console.log(`  Max:     ${pgParallelStats.max.toFixed(3)}s`);
  console.log(`  StdDev:  ${pgParallelStats.stdDev.toFixed(3)}s`);

  console.log('\nSequential (baseline):');
  console.log(`  Average: ${sequentialStats.avg.toFixed(3)}s`);
  console.log(`  Min:     ${sequentialStats.min.toFixed(3)}s`);
  console.log(`  Max:     ${sequentialStats.max.toFixed(3)}s`);
  console.log(`  StdDev:  ${sequentialStats.stdDev.toFixed(3)}s`);

  const speedup = sequentialStats.avg / pgParallelStats.avg;
  console.log(`\nAverage Performance: ${speedup.toFixed(2)}x faster than Sequential`);
};

benchmarkCpuMultipleRuns().catch(console.error);
