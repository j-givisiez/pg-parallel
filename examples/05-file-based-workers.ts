import 'dotenv/config';
import * as path from 'path';
import { PgParallel } from '../src';

/**
 * Demonstrates file-based workers with external task modules.
 * This example shows how to organize worker logic in separate files.
 */
async function main(): Promise<void> {
  console.log('Running Example 5: File-based Workers');

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
    console.log('\n=== Using default handler ===');
    const defaultResult = await db.worker({
      taskPath: path.resolve(process.cwd(), 'examples/tasks/report-worker.js'),
      args: ['Hello from file-based worker!'],
    });
    console.log('Default handler result:', defaultResult);

    console.log('\n=== Using named function ===');
    const reportResult = await db.worker({
      taskPath: path.resolve(process.cwd(), 'examples/tasks/report-worker.js'),
      taskName: 'generateReport',
      args: ['summary'],
    });
    console.log('Report result:', reportResult);
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
