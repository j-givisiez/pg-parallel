/**
 * @file Implements the core logic for the pg-parallel manager.
 */

import * as path from 'path';
import { cpus } from 'os';
import { Pool, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { Worker } from 'worker_threads';
import { v4 as uuidv4 } from 'uuid';
import {
  IPgParallel,
  PgParallelConfig,
  IParallelClient,
  WorkerFileTask,
  Logger,
  RetryConfig,
  CircuitBreakerConfig,
  PgParallelError,
  ErrorCategory,
} from './types';

class ParallelClient implements IParallelClient {
  constructor(
    public readonly id: string,
    private manager: PgParallel,
    private worker: Worker,
  ) {}

  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    config: QueryConfig<I> | string,
    values?: I,
  ): Promise<QueryResult<R>> {
    return this.manager.proxyQueryToWorker(this.worker, this.id, config, values);
  }
}

/**
 * Manages a pool of worker threads to execute PostgreSQL queries in parallel.
 * This class acts as a replacement for `pg.Pool`, providing a `connect` method
 * that returns a proxy client for executing commands in parallel.
 *
 * @implements {IPgParallel}
 */
export class PgParallel implements IPgParallel {
  private localPool: Pool;
  private workers: { worker: Worker; isBusy: boolean }[] = [];
  private currentWorkerIndex = 0;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();
  private readonly config: PgParallelConfig;
  private isShutdown = false;
  private initializationPromise: Promise<void> | null = null;

  private readonly logger: Logger = {};

  // Circuit breaker state for main-thread pool operations
  private breakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private consecutiveFailures = 0;
  private halfOpenAllowedCalls = 0;
  private halfOpenSuccesses = 0;
  private breakerOpenedAt = 0;

  constructor(config: PgParallelConfig) {
    if (!config.connectionString) {
      throw new Error("A 'connectionString' is required in the configuration.");
    }
    this.config = config;

    const maxWorkers = this.config.maxWorkers ?? cpus().length;
    const totalMax = this.config.max ?? 10;

    const workerMax = maxWorkers > 0 ? Math.max(1, Math.floor(totalMax / (maxWorkers + 1))) : 0;
    const localMax = Math.max(1, totalMax - workerMax * maxWorkers);

    this.localPool = new Pool({ ...config, max: localMax });
    if (config.logger) {
      this.logger = config.logger;
    }
  }

  /**
   * Pre-initializes the worker thread pool to avoid a "cold start" on the first
   * call to `.task()` or `.worker()`. This method is idempotent and can be
   * safely called multiple times. It's useful for warming up the workers
   * before running performance-sensitive operations.
   * @returns A promise that resolves when all workers are ready.
   */
  public warmup(): Promise<void> {
    return this.ensureWorkersInitialized();
  }

  private ensureWorkersInitialized(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    if (this.isShutdown) return Promise.resolve();

    this.initializationPromise = (async () => {
      const maxWorkers = this.config.maxWorkers ?? cpus().length;
      if (maxWorkers === 0) return;

      const totalMax = this.config.max ?? 10;
      const workerMax = Math.max(1, Math.floor(totalMax / (maxWorkers + 1)));
      const workerConfig = { ...this.config, max: workerMax };

      const workerPromises = Array.from({ length: maxWorkers }, () => {
        const isTest = process.env.JEST_WORKER_ID !== undefined;
        const isTsNode = !!(process as any)[Symbol.for('ts-node.register.instance')];
        const workerPath = path.resolve(__dirname, isTest || isTsNode ? 'pool-worker.ts' : 'pool-worker.js');

        const worker = new Worker(workerPath, {
          workerData: {
            poolConfig: workerConfig,
            retry: this.config.retry ?? null,
            circuitBreaker: this.config.circuitBreaker ?? null,
            enableWorkerLogs: !!this.config.logger,
          },
          execArgv: isTest || isTsNode ? ['-r', 'ts-node/register'] : undefined,
        });

        this.workers.push({ worker, isBusy: false });
        return new Promise<void>((resolve, reject) => {
          worker.once('online', resolve);
          worker.once('error', reject);
          worker.on('message', (msg: any) => this.handleWorkerMessage(msg));
          worker.on('exit', (code) => {
            if (code !== 0 && !this.isShutdown) {
              this.logger.error?.('Worker stopped with non-zero exit code', { code });
            }
          });
        });
      });

      await Promise.all(workerPromises);
    })();
    return this.initializationPromise;
  }

  private handleWorkerMessage(message: {
    requestId: string;
    workerId: string;
    data?: any;
    error?: { message: string };
  }) {
    const workerInfo = this.workers.find((w) => w.worker.threadId.toString() === message.workerId);
    if (workerInfo) workerInfo.isBusy = false;

    const request = this.pendingRequests.get(message.requestId);
    if (!request) return;

    if (message.error) {
      const category = this.categorizeError(message.error);
      this.logger.warn?.('Worker operation failed', {
        workerId: message.workerId,
        category,
        message: message.error.message,
      });
      request.reject(new PgParallelError(message.error.message, category));
    } else request.resolve(message.data);

    this.pendingRequests.delete(message.requestId);
  }

  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    config: string | QueryConfig<I>,
    values?: I,
  ): Promise<QueryResult<R>> {
    const exec = () => this.localPool.query<R, I>(config as any, values as any) as Promise<QueryResult<R>>;
    return this.executeWithBreakerAndRetry<QueryResult<R>>(exec, 'main.query');
  }

  public task<T, A extends any[]>(fn: (...args: A) => T | Promise<T>, args: A): Promise<T> {
    const exec = async () => {
      if (this.isShutdown) {
        throw new Error('No workers available. Instance has been shut down.');
      }
      await this.ensureWorkersInitialized();
      if (this.workers.length === 0) {
        throw new Error("No workers available. Configure 'maxWorkers' to be greater than 0 to use this feature.");
      }
      const workerInfo = this.getNextWorker();
      workerInfo.isBusy = true;
      const requestId = uuidv4();
      const promise = new Promise<T>((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });
      });
      workerInfo.worker.postMessage({
        type: 'task',
        requestId,
        payload: { task: fn.toString(), args },
      });
      return promise;
    };
    return exec();
  }

  public worker<T>(task: ((client: IParallelClient) => Promise<T>) | WorkerFileTask): Promise<T> {
    const exec = async () => {
      if (this.isShutdown) {
        throw new Error('No workers available. Instance has been shut down.');
      }
      await this.ensureWorkersInitialized();
      if (this.workers.length === 0) {
        throw new Error("No workers available. Configure 'maxWorkers' to be greater than 0 to use this feature.");
      }
      const workerInfo = this.getNextWorker();
      workerInfo.isBusy = true;
      const requestId = uuidv4();
      const promise = new Promise<T>((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });
      });

      if (typeof task === 'function') {
        const clientId = uuidv4();
        const client = new ParallelClient(clientId, this, workerInfo.worker);
        const payload = { task: task.toString(), clientId };
        workerInfo.worker.postMessage({ type: 'worker', requestId, payload });
      } else {
        const payload = { workerFile: task };
        workerInfo.worker.postMessage({ type: 'worker', requestId, payload });
      }

      return promise;
    };
    return exec();
  }

  proxyQueryToWorker<R extends QueryResultRow, I extends any[]>(
    worker: Worker,
    clientId: string,
    config: string | QueryConfig<I>,
    values: I | undefined,
  ): Promise<QueryResult<R>> {
    const requestId = uuidv4();
    const promise = new Promise<QueryResult<R>>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
    });

    const payload = typeof config === 'object' ? { ...config } : { text: config, values };
    worker.postMessage({ type: 'query', clientId, requestId, payload });
    return promise;
  }

  public async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;

    await this.localPool.end();
    await Promise.all(this.workers.map(({ worker }) => worker.terminate()));
    this.workers = [];
  }

  private getNextWorker(): { worker: Worker; isBusy: boolean } {
    for (let i = 0; i < this.workers.length; i++) {
      const workerInfo = this.workers[this.currentWorkerIndex];
      this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
      if (!workerInfo.isBusy) {
        return workerInfo;
      }
    }

    const workerInfo = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
    return workerInfo;
  }

  /**
   * Executes an operation protected by a circuit breaker and optional retry.
   */
  private async executeWithBreakerAndRetry<T>(operation: () => Promise<T>, opName: string): Promise<T> {
    await this.ensureBreakerState();
    if (this.breakerState === 'OPEN') {
      const err = new PgParallelError('Circuit breaker is open', 'CONNECTION');
      this.logger.warn?.('Breaker OPEN - rejecting operation', { opName });
      throw err;
    }

    const execOnce = async () => {
      try {
        const result = await operation();
        this.onBreakerSuccess();
        return result;
      } catch (error) {
        this.onBreakerFailure();
        throw this.wrapError(error);
      }
    };

    const retryConfig = this.config.retry;
    if (!retryConfig) {
      return execOnce();
    }
    return this.executeWithRetry(execOnce, retryConfig, opName);
  }

  /**
   * Simple exponential backoff with optional jitter.
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, cfg: RetryConfig, opName: string): Promise<T> {
    let attempt = 0;
    let delay = Math.max(0, cfg.initialDelayMs);
    const maxDelay = Math.max(delay, cfg.maxDelayMs);
    const shouldRetry = cfg.retryOn ?? ((err) => this.isTransient(err));

    while (true) {
      attempt += 1;
      try {
        if (attempt > 1) {
          this.logger.info?.('Retrying operation', { opName, attempt });
        }
        const result = await fn();
        return result;
      } catch (error) {
        const canRetry = attempt < cfg.maxAttempts && shouldRetry(error);
        if (!canRetry) throw error;
        const jitter = cfg.jitter ? Math.random() * 0.25 * delay : 0;
        const wait = Math.min(maxDelay, delay + jitter);
        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(maxDelay, Math.ceil(delay * cfg.backoffFactor));
      }
    }
  }

  /**
   * Updates breaker state on success.
   */
  private onBreakerSuccess(): void {
    if (this.breakerState === 'HALF_OPEN') {
      this.halfOpenSuccesses += 1;
      const cfg = this.getCircuitBreakerConfig();
      if (this.halfOpenSuccesses >= cfg.halfOpenSuccessesToClose) {
        this.breakerState = 'CLOSED';
        this.consecutiveFailures = 0;
        this.logger.info?.('Breaker CLOSED after successful half-open trials');
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Updates breaker state on failure.
   */
  private onBreakerFailure(): void {
    const cfg = this.getCircuitBreakerConfig();
    this.consecutiveFailures += 1;
    if (this.breakerState === 'HALF_OPEN') {
      // Re-open
      this.openBreaker();
      return;
    }
    if (this.consecutiveFailures >= cfg.failureThreshold && this.breakerState === 'CLOSED') {
      this.openBreaker();
    }
  }

  private openBreaker(): void {
    const cfg = this.getCircuitBreakerConfig();
    this.breakerState = 'OPEN';
    this.breakerOpenedAt = Date.now();
    this.halfOpenAllowedCalls = cfg.halfOpenMaxCalls;
    this.halfOpenSuccesses = 0;
    this.logger.warn?.('Breaker OPENED');
  }

  private async ensureBreakerState(): Promise<void> {
    if (this.breakerState === 'OPEN') {
      const cfg = this.getCircuitBreakerConfig();
      const elapsed = Date.now() - this.breakerOpenedAt;
      if (elapsed >= cfg.cooldownMs) {
        this.breakerState = 'HALF_OPEN';
        this.halfOpenSuccesses = 0;
        this.logger.info?.('Breaker HALF_OPEN');
      }
    }
    if (this.breakerState === 'HALF_OPEN') {
      if (this.halfOpenAllowedCalls <= 0) {
        throw new PgParallelError('Circuit breaker trial limit reached', 'CONNECTION');
      }
      this.halfOpenAllowedCalls -= 1;
    }
  }

  private getCircuitBreakerConfig(): CircuitBreakerConfig {
    return (
      this.config.circuitBreaker ?? {
        failureThreshold: 5,
        cooldownMs: 10_000,
        halfOpenMaxCalls: 2,
        halfOpenSuccessesToClose: 2,
      }
    );
  }

  /**
   * Returns true if the error is likely transient and worth retrying.
   */
  private isTransient(error: unknown): boolean {
    const category = this.categorizeError(error);
    return (
      category === 'TRANSIENT' ||
      category === 'CONNECTION' ||
      category === 'TIMEOUT' ||
      category === 'DEADLOCK' ||
      category === 'SERIALIZATION'
    );
  }

  /**
   * Wraps any error into PgParallelError with a category.
   */
  private wrapError(error: unknown): PgParallelError {
    if (error instanceof PgParallelError) return error;
    // Unwrap AggregateError for clearer messaging
    const aggregate: any = error as any;
    let baseError: any = error;
    if (
      aggregate &&
      aggregate.name === 'AggregateError' &&
      Array.isArray(aggregate.errors) &&
      aggregate.errors.length > 0
    ) {
      baseError = aggregate.errors[0];
    }
    const category = this.categorizeError(baseError);
    let message = baseError?.message;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      message = 'Unknown error';
    }
    return new PgParallelError(message, category, error);
  }

  /**
   * Categorizes errors based on pg error codes and common Node.js error codes.
   */
  private categorizeError(error: unknown): ErrorCategory {
    const err: any = error as any;
    const code: string | undefined = err?.code;
    const name: string | undefined = err?.name;
    const message: string | undefined = err?.message;
    // Unwrap AggregateError if present
    if (name === 'AggregateError' && Array.isArray(err?.errors) && err.errors.length > 0) {
      return this.categorizeError(err.errors[0]);
    }

    if (code === '40001') return 'SERIALIZATION'; // serialization_failure
    if (code === '40P01') return 'DEADLOCK'; // deadlock_detected
    if (code === 'ETIMEDOUT' || code === '57014') return 'TIMEOUT';
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === '57P01' || code === '57P02') return 'CONNECTION';
    if (code && code.startsWith('23')) return 'CONSTRAINT'; // integrity constraint violation class
    if (code && code.startsWith('42')) return 'SYNTAX'; // syntax error or access rule violation

    if (name === 'SequelizeConnectionError') return 'CONNECTION';
    if (message && /timeout/i.test(message)) return 'TIMEOUT';
    if (message && /connection/i.test(message)) return 'CONNECTION';
    if (message && /deadlock/i.test(message)) return 'DEADLOCK';

    return 'UNKNOWN';
  }
}
