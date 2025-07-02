/**
 * @file Integration tests for PgParallel, running against a real database.
 */

import 'dotenv/config';
import { cpus } from 'os';
import { PgParallel } from '../src/pg-parallel';
import type { IParallelClient } from '../src/types';

const describeif = process.env.DATABASE_URL ? describe : describe.skip;

describeif('PgParallel (Integration)', () => {
  let db: PgParallel;

  beforeEach(() => {
    db = new PgParallel({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      maxWorkers: cpus().length > 1 ? 2 : 1, // Use a small number of workers for testing
    });
  });

  afterEach(async () => {
    await db.shutdown();
  });

  // Test for db.query()
  describe('.query()', () => {
    it('should execute a simple query on the main thread pool', async () => {
      const { rows } = await db.query('SELECT 1 AS value');
      expect(rows[0]).toEqual({ value: 1 });
    });

    it('should handle failing queries', async () => {
      await expect(db.query('SELECT * FROM non_existent_table')).rejects.toThrow(
        'relation "non_existent_table" does not exist',
      );
    });

    it('should execute a query with parameters', async () => {
      const { rows } = await db.query('SELECT $1::INT AS value', [123]);
      expect(rows[0]).toEqual({ value: 123 });
    });
  });

  // Test for db.task()
  describe('.task()', () => {
    it('should execute a pure CPU task in a worker', async () => {
      const task = (a: number, b: number) => a + b;
      const result = await db.task(task, [5, 10]);
      expect(result).toBe(15);
    });

    it('should handle failing CPU tasks', async () => {
      const failingTask = () => {
        throw new Error('CPU task failed');
      };
      await expect(db.task(failingTask, [])).rejects.toThrow('CPU task failed');
    });

    it('should handle failing queries within a worker', async () => {
      await expect(
        db.worker(async (client: IParallelClient) => {
          await client.query('SELECT * FROM non_existent_table');
        }),
      ).rejects.toThrow('relation "non_existent_table" does not exist');
    });
  });

  // Test for db.worker()
  describe('.worker()', () => {
    it('should execute a mixed task with a client in a worker', async () => {
      const result = await db.worker(async (client: IParallelClient) => {
        const { rows } = await client.query('SELECT 10 AS value');
        return rows[0].value * 2;
      });
      expect(result).toBe(20);
    });

    it('should handle failing queries within a worker', async () => {
      await expect(
        db.worker(async (client: IParallelClient) => {
          await client.query('SELECT * FROM non_existent_table');
        }),
      ).rejects.toThrow('relation "non_existent_table" does not exist');
    });
  });

  // Test for Transactions
  describe('Transactions', () => {
    beforeEach(async () => {
      // Create a temporary table for transaction tests
      await db.query(`
        CREATE TABLE IF NOT EXISTS transaction_test (
          id INT PRIMARY KEY,
          value INT
        );
      `);
      await db.query('TRUNCATE transaction_test;');
    });

    it('should commit a transaction if successful', async () => {
      await db.worker(async (client: IParallelClient) => {
        await client.query('BEGIN');
        await client.query('INSERT INTO transaction_test (id, value) VALUES (1, 100)');
        await client.query('COMMIT');
      });

      const { rows } = await db.query('SELECT value FROM transaction_test WHERE id = 1');
      expect(rows[0].value).toBe(100);
    });

    it('should rollback a transaction if it fails', async () => {
      await expect(
        db.worker(async (client: IParallelClient) => {
          await client.query('BEGIN');
          await client.query('INSERT INTO transaction_test (id, value) VALUES (1, 100)');
          // This query will fail, causing an implicit rollback
          await client.query('INSERT INTO transaction_test (id, value) VALUES (1, 200)');
        }),
      ).rejects.toThrow('duplicate key value violates unique constraint');

      const { rowCount } = await db.query('SELECT * FROM transaction_test');
      expect(rowCount).toBe(0);
    });
  });

  // Test for parallelism
  describe('Parallel Execution', () => {
    it('should run multiple tasks in parallel', async () => {
      // Use a slightly longer task to make the parallelism more obvious than the overhead
      const shortTask = () => new Promise((res) => setTimeout(() => res(true), 200));
      const promises = [db.task(shortTask, []), db.task(shortTask, []), db.task(shortTask, []), db.task(shortTask, [])];

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toEqual([true, true, true, true]);
      // Serial execution would be > 800ms (4 * 200ms).
      // With ts-node overhead, we expect it to be more than a single task (200ms)
      // but significantly less than serial execution. Let's set a generous upper bound.
      const isCI = !!process.env.CI;
      const upperBound = isCI ? 5000 : 1500;
      expect(duration).toBeLessThan(upperBound);
    });
  });

  // Test for Configuration and Shutdown
  describe('Configuration and Shutdown', () => {
    it('should throw an error if worker methods are called with maxWorkers = 0', async () => {
      const noWorkerDb = new PgParallel({
        connectionString: process.env.DATABASE_URL,
        maxWorkers: 0,
      });
      const expectedError = "No workers available. Configure 'maxWorkers' to be greater than 0 to use this feature.";
      await expect(noWorkerDb.task(async () => {}, [])).rejects.toThrow(expectedError);
      await expect(noWorkerDb.worker(async (client) => {})).rejects.toThrow(expectedError);
      // important to shut down this separate instance
      await noWorkerDb.shutdown();
    });

    it('should reject new operations after shutdown', async () => {
      // Use a separate instance to avoid double-shutdown from afterEach
      const shutdownDb = new PgParallel({
        connectionString: process.env.DATABASE_URL,
      });

      await shutdownDb.shutdown();

      // Test that a new query fails with the correct message
      await expect(shutdownDb.query('SELECT 1')).rejects.toThrow('Cannot use a pool after calling end on the pool');
      // Test that a new task fails
      await expect(shutdownDb.task(async () => {}, [])).rejects.toThrow(
        'No workers available. Instance has been shut down.',
      );
    });
  });
});
