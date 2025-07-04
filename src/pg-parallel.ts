/**
 * @file Implements the core logic for the pg-parallel manager.
 */

import * as path from 'path';
import { cpus } from 'os';
import { Pool, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { Worker } from 'worker_threads';
import { v4 as uuidv4 } from 'uuid';
import { IPgParallel, PgParallelConfig, IParallelClient, WorkerFileTask } from './types';

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
          workerData: { poolConfig: workerConfig },
          execArgv: isTest || isTsNode ? ['-r', 'ts-node/register'] : undefined,
        });

        this.workers.push({ worker, isBusy: false });
        return new Promise<void>((resolve, reject) => {
          worker.once('online', resolve);
          worker.once('error', reject);
          worker.on('message', (msg: any) => this.handleWorkerMessage(msg));
          worker.on('exit', (code) => {
            if (code !== 0 && !this.isShutdown) console.error(`Worker stopped with exit code ${code}`);
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

    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.data);

    this.pendingRequests.delete(message.requestId);
  }

  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    config: string | QueryConfig<I>,
    values?: I,
  ): Promise<QueryResult<R>> {
    return this.localPool.query(config, values);
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
}
