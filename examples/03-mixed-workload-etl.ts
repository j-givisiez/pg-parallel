import 'dotenv/config';
import { IParallelClient, PgParallel } from '../src';

/**
 * Simulates a transactional ETL (Extract, Transform, Load) process.
 * This function is designed to be executed entirely within a worker thread.
 * @param client An `IParallelClient` instance provided by `db.worker()`.
 * @returns An object containing the number of processed events.
 */
async function etlProcess(client: IParallelClient) {
  console.log('[Worker] Starting ETL process');
  await client.query('BEGIN');
  console.log('[Worker] Transaction started');

  try {
    const { rows: events } = await client.query('SELECT * FROM raw_events WHERE processed = FALSE FOR UPDATE');

    if (events.length === 0) {
      console.log('[Worker] No new events to process');
      await client.query('COMMIT');
      return { processed: 0 };
    }

    console.log(`[Worker] Extracted ${events.length} new events`);

    for (const event of events) {
      const transformedPayload = {
        ...event.payload,
        processedAt: new Date().toISOString(),
        source: 'etl-worker',
      };

      await client.query('INSERT INTO processed_reports (report_data, source_event_id) VALUES ($1, $2)', [
        transformedPayload,
        event.id,
      ]);

      await client.query('UPDATE raw_events SET processed = TRUE WHERE id = $1', [event.id]);
    }

    await client.query('COMMIT');
    console.log('[Worker] Transaction committed successfully');
    return { processed: events.length };
  } catch (error) {
    console.error('[Worker] Error during ETL, rolling back transaction', error);
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Demonstrates a mixed I/O and CPU workload by offloading a complete
 * ETL process to a worker thread using `db.worker()`.
 */
async function main() {
  console.log('Running Example 3: Mixed Workload (ETL)');

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

  try {
    console.log('Offloading ETL process to a worker');
    const result = await db.worker(etlProcess);
    console.log(`\nETL process completed: Processed ${result.processed} events`);
  } catch (error) {
    console.error('An error occurred during the ETL process:', error);
  } finally {
    await db.shutdown();
    console.log('Workers and database connection shut down');
  }
}

main().catch(console.error);
