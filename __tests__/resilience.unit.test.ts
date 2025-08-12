import { PgParallel } from '../src/pg-parallel';
import { PgParallelError } from '../src/types';

describe('Resilience (Unit)', () => {
  describe('Retry on transient errors', () => {
    it('retries main-thread query until success', async () => {
      const db = new PgParallel({
        connectionString: 'postgresql://user:pass@localhost/db',
        maxWorkers: 0,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 1,
          maxDelayMs: 1,
          backoffFactor: 1,
          jitter: false,
        },
      });

      let calls = 0;
      const fakePool = {
        query: jest.fn().mockImplementation(() => {
          calls += 1;
          if (calls < 3) {
            const err: any = new Error('timeout');
            err.code = 'ETIMEDOUT';
            return Promise.reject(err);
          }
          return Promise.resolve({ rows: [{ value: 1 }] });
        }),
        end: jest.fn().mockResolvedValue(undefined),
      } as any;

      (db as any).localPool = fakePool;

      const result = await db.query('SELECT 1');
      expect(result.rows[0].value).toBe(1);
      expect(fakePool.query).toHaveBeenCalledTimes(3);

      await db.shutdown();
    });
  });

  describe('Circuit breaker', () => {
    it('opens after a failure and rejects subsequent calls', async () => {
      const db = new PgParallel({
        connectionString: 'postgresql://user:pass@localhost/db',
        maxWorkers: 0,
        circuitBreaker: {
          failureThreshold: 1,
          cooldownMs: 60_000,
          halfOpenMaxCalls: 1,
          halfOpenSuccessesToClose: 1,
        },
      });

      const err: any = new Error('connection reset');
      err.code = 'ECONNRESET';
      const fakePool = {
        query: jest.fn().mockRejectedValue(err),
        end: jest.fn().mockResolvedValue(undefined),
      } as any;
      (db as any).localPool = fakePool;

      await expect(db.query('SELECT 1')).rejects.toThrow(PgParallelError);

      await expect(db.query('SELECT 1')).rejects.toThrow('Circuit breaker is open');

      await db.shutdown();
    });
  });
});
