import 'dotenv/config';
import * as path from 'path';
import { PgParallel } from '../src';

/**
 * Example demonstrating file-based workers with external imports
 * This shows how worker modules can use require() to import libraries
 */

interface HandlerResult {
  id: string;
  message: string;
  timestamp: string;
}

interface ReportResult {
  id: string;
  type: string;
  recordCount: number;
  generatedAt: string;
  content: string;
}

if (!process.env.DATABASE_URL) {
  console.error('Please set DATABASE_URL environment variable');
  process.exit(1);
}

const main = async () => {
  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL,
    maxWorkers: 2,
  });

  try {
    console.log('Testing file-based worker with imports...\n');

    console.log('1. Default handler with UUID:');
    const defaultResult = await db.worker<HandlerResult>({
      taskPath: path.resolve(__dirname, 'tasks/report-worker.js'),
      args: ['Task with UUID generation'],
    });
    console.log('   Result:', defaultResult);
    console.log('   UUID generated:', defaultResult.id);

    console.log('\n2. Named function with UUID:');
    const reportResult = await db.worker<ReportResult>({
      taskPath: path.resolve(__dirname, 'tasks/report-worker.js'),
      taskName: 'generateReport',
      args: ['detailed'],
    });
    console.log('   Result:', reportResult);
    console.log('   Report ID generated:', reportResult.id);

    console.log('\n3. Multiple parallel workers:');
    const parallelTasks = [
      db.worker<ReportResult>({
        taskPath: path.resolve(__dirname, 'tasks/report-worker.js'),
        taskName: 'generateReport',
        args: ['summary'],
      }),
      db.worker<ReportResult>({
        taskPath: path.resolve(__dirname, 'tasks/report-worker.js'),
        taskName: 'generateReport',
        args: ['detailed'],
      }),
      db.worker<HandlerResult>({
        taskPath: path.resolve(__dirname, 'tasks/report-worker.js'),
        args: ['Parallel task execution'],
      }),
    ];

    const results = await Promise.all(parallelTasks);
    results.forEach((result, index) => {
      console.log(`   Task ${index + 1}:`, {
        id: result.id,
        type: (result as ReportResult).type || 'handler',
        message: (result as HandlerResult).message || (result as ReportResult).content,
      });
    });

    console.log('\nAll workers completed successfully');
    console.log('Key benefits demonstrated:');
    console.log('   - Workers can use require() to import external libraries');
    console.log('   - Each worker execution gets unique IDs via UUID');
    console.log('   - Multiple workers can run in parallel');
    console.log('   - Database queries work normally within workers');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.shutdown();
  }
};

main().catch(console.error);
