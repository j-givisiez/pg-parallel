import 'dotenv/config';
import { PgParallel } from '../src';

/**
 * A self-contained, CPU-intensive function to calculate a Fibonacci number recursively.
 * It is defined as a named function to ensure it can be properly serialized
 * and executed in a worker thread.
 * @param n The number to calculate the Fibonacci for.
 * @returns The Fibonacci number.
 */
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Demonstrates how to offload a CPU-intensive task to a worker thread.
 * It starts a timer to show the event loop is not blocked while the
 * heavy computation runs in the background using `db.task()`.
 */
async function main() {
  console.log('Running Example 2: CPU-Intensive Task');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL,
    maxWorkers: 1,
  });

  console.log('Warming up worker pool...');
  await db.warmup();
  console.log('Worker pool is ready');

  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    console.log(`Event loop is not blocked (Tick ${counter})`);
  }, 500);

  try {
    const complexity = 42;
    console.log(`\nOffloading a heavy CPU task (Fibonacci of ${complexity}) to a worker`);

    const result = await db.task(fibonacci, [complexity]);

    console.log(`\nCPU task completed in worker: Result ${result}`);
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    clearInterval(interval);
    await db.shutdown();
    console.log('Workers and database connection shut down');
  }
}

main().catch(console.error);
