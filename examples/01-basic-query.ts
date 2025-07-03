import 'dotenv/config';
import { PgParallel } from '../src';

/**
 * Demonstrates a basic I/O-bound query using `db.query()`.
 * This function connects to the database, fetches a list of users,
 * prints them to the console, and then shuts down the connection.
 */
async function main() {
  console.log('Running Example 1: Basic Query');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const { rows } = await db.query('SELECT * FROM users ORDER BY id;');
    console.log('Query successful: Fetched users');
    console.table(rows);
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await db.shutdown();
    console.log('Database connection shut down');
  }
}

main().catch(console.error);
