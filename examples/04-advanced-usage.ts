import 'dotenv/config';
import * as path from 'path';
import { PgParallel } from '../src';

/**
 * Demonstrates advanced usage with file-based workers.
 * This example follows exactly the documentation from the README.md Advanced Usage section.
 */
async function main(): Promise<void> {
  console.log('Running Example 4: Advanced Usage');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL,
    maxWorkers: 2,
  });

  console.log('Warming up worker pool...');
  await db.warmup();
  console.log('Worker pool is ready');

  try {
    console.log('\n=== Execute specific named function ===');
    const report = await db.worker({
      taskPath: path.resolve(process.cwd(), 'examples/tasks/report-worker.js'),
      taskName: 'generateReport',
      args: ['detailed'],
    });
    console.log('Report result:', report);

    console.log('\n=== Execute default handler ===');
    const result = await db.worker({
      taskPath: path.resolve(process.cwd(), 'examples/tasks/report-worker.js'),
      args: ['Hello from main thread'],
    });
    console.log('Default handler result:', result);
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await db.shutdown();
    console.log('\nWorkers and database connections shut down');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
