import 'dotenv/config';
import { PgParallel } from '../pg-parallel';
import { Pool } from 'pg';

const TOTAL_REQUESTS_IO = 10000;
const TOTAL_MAX_CLIENTS = 100;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const pgParallelConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
};

const pgPoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: TOTAL_MAX_CLIENTS,
};

const benchmarkIo = async () => {
  console.log(`--- Running Pure I/O Benchmark (${TOTAL_REQUESTS_IO} requests) ---`);

  const db = new PgParallel(pgParallelConfig);
  let startTime = Date.now();
  await Promise.all(Array.from({ length: TOTAL_REQUESTS_IO }, () => db.query('SELECT 1')));
  console.log(`pg-parallel (.query): ${(Date.now() - startTime) / 1000}s`);
  await db.shutdown();

  const pool = new Pool(pgPoolConfig);
  startTime = Date.now();
  await Promise.all(Array.from({ length: TOTAL_REQUESTS_IO }, () => pool.query('SELECT 1')));
  console.log(`pg.Pool (baseline):   ${(Date.now() - startTime) / 1000}s`);
  await pool.end();
};

benchmarkIo().catch(console.error);
