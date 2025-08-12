import { PgParallel } from '../src/pg-parallel';
import type { Logger } from '../src/types';

describe('Logging (Unit)', () => {
  const createLogger = () => {
    const logs: { level: 'info' | 'warn' | 'error' | 'debug'; message: string; meta?: any }[] = [];
    const logger: Logger = {
      info: (message, meta) => logs.push({ level: 'info', message, meta }),
      warn: (message, meta) => logs.push({ level: 'warn', message, meta }),
      error: (message, meta) => logs.push({ level: 'error', message, meta }),
      debug: (message, meta) => logs.push({ level: 'debug', message, meta }),
    };
    return { logger, logs };
  };

  it('logs retry attempts on main-thread query', async () => {
    const { logger, logs } = createLogger();
    const db = new PgParallel({
      connectionString: 'postgresql://user:pass@localhost/db',
      maxWorkers: 0,
      retry: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1, backoffFactor: 1, jitter: false },
      logger,
    });

    let called = 0;
    const fakePool = {
      query: jest.fn().mockImplementation(() => {
        called += 1;
        if (called < 2) {
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
    expect(
      logs.some((l) => l.level === 'info' && l.message === 'Retrying operation' && l.meta?.opName === 'main.query'),
    ).toBe(true);

    await db.shutdown();
  });

  it('logs breaker open and reject events on main-thread', async () => {
    const { logger, logs } = createLogger();
    const db = new PgParallel({
      connectionString: 'postgresql://user:pass@localhost/db',
      maxWorkers: 0,
      circuitBreaker: { failureThreshold: 1, cooldownMs: 60_000, halfOpenMaxCalls: 1, halfOpenSuccessesToClose: 1 },
      logger,
    });

    const err: any = new Error('connection reset');
    err.code = 'ECONNRESET';
    const fakePool = {
      query: jest.fn().mockRejectedValue(err),
      end: jest.fn().mockResolvedValue(undefined),
    } as any;
    (db as any).localPool = fakePool;

    await expect(db.query('SELECT 1')).rejects.toThrow();
    expect(logs.some((l) => l.level === 'warn' && l.message === 'Breaker OPENED')).toBe(true);

    await expect(db.query('SELECT 1')).rejects.toThrow('Circuit breaker is open');
    expect(
      logs.some(
        (l) =>
          l.level === 'warn' && l.message === 'Breaker OPEN - rejecting operation' && l.meta?.opName === 'main.query',
      ),
    ).toBe(true);

    await db.shutdown();
  });

  it('logs half-open transition and close after success', async () => {
    const { logger, logs } = createLogger();
    const db = new PgParallel({
      connectionString: 'postgresql://user:pass@localhost/db',
      maxWorkers: 0,
      circuitBreaker: { failureThreshold: 1, cooldownMs: 10, halfOpenMaxCalls: 1, halfOpenSuccessesToClose: 1 },
      logger,
    });

    let called = 0;
    const fakePool = {
      query: jest.fn().mockImplementation(() => {
        called += 1;
        if (called === 1) {
          const err: any = new Error('connection reset');
          err.code = 'ECONNRESET';
          return Promise.reject(err);
        }
        return Promise.resolve({ rows: [{ ok: true }] });
      }),
      end: jest.fn().mockResolvedValue(undefined),
    } as any;
    (db as any).localPool = fakePool;

    await expect(db.query('SELECT 1')).rejects.toThrow();
    expect(logs.some((l) => l.level === 'warn' && l.message === 'Breaker OPENED')).toBe(true);

    await new Promise((r) => setTimeout(r, 15));

    const res = await db.query('SELECT 1');
    expect(res.rows[0].ok).toBe(true);

    expect(logs.some((l) => l.level === 'info' && l.message === 'Breaker HALF_OPEN')).toBe(true);
    expect(
      logs.some((l) => l.level === 'info' && l.message === 'Breaker CLOSED after successful half-open trials'),
    ).toBe(true);

    await db.shutdown();
  });

  it('logs worker operation failures when worker reports error', async () => {
    const { logger, logs } = createLogger();
    const db = new PgParallel({ connectionString: 'postgresql://user:pass@localhost/db', maxWorkers: 0, logger });

    const requestId = 'req-1';
    (db as any).pendingRequests.set(requestId, { resolve: () => {}, reject: () => {} });

    (db as any).handleWorkerMessage({
      requestId,
      workerId: '123',
      error: { message: 'relation "non_existent_table" does not exist' },
    });

    expect(logs.some((l) => l.level === 'warn' && l.message === 'Worker operation failed')).toBe(true);

    await db.shutdown();
  });
});
