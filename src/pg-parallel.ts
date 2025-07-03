/**
 * @file Implements the core logic for the pg-parallel manager.
 */

import * as path from 'path';
import { cpus } from 'os';
import { Pool, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { Worker } from 'worker_threads';
import { v4 as uuidv4 } from 'uuid';
import { IParallelClient, IPgParallel, PgParallelConfig } from './types';

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
  private workers: Worker[] = [];
  private currentWorkerIndex = 0;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();
  private readonly config: PgParallelConfig;
  private isShutdown = false;

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

  private ensureWorkersInitialized() {
    if (this.isShutdown || this.workers.length > 0) {
      return;
    }

    const maxWorkers = this.config.maxWorkers ?? cpus().length;
    if (maxWorkers > 0) {
      const totalMax = this.config.max ?? 10;
      const workerMax = Math.max(1, Math.floor(totalMax / (maxWorkers + 1)));
      const workerConfig = { ...this.config, max: workerMax };

      for (let i = 0; i < maxWorkers; i++) {
        const isTest = process.env.JEST_WORKER_ID !== undefined;
        // A robust way to check if we're running in a ts-node environment.
        const isTsNode = !!(process as any)[Symbol.for('ts-node.register.instance')];
        const workerPath = path.resolve(__dirname, isTest || isTsNode ? 'pool-worker.ts' : 'pool-worker.js');

        const worker = new Worker(workerPath, {
          workerData: { poolConfig: workerConfig },
          // If in test or ts-node mode, we need to use ts-node to transpile the worker
          execArgv: isTest || isTsNode ? ['-r', 'ts-node/register'] : undefined,
        });

        worker.on('message', this.handleWorkerMessage.bind(this));
        worker.on('error', (err) => console.error(`Worker error: ${err.message}`));
        worker.on('exit', (code) => {
          // Only log an error if the worker exited unexpectedly (not during a manual shutdown)
          if (code !== 0 && !this.isShutdown) {
            console.error(`Worker stopped with exit code ${code}`);
          }
        });
        this.workers.push(worker);
      }
    }
  }

  private handleWorkerMessage(message: { requestId: string; data?: any; error?: any }) {
    const { requestId, data, error } = message;
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    if (error) {
      request.reject(new Error(error.message));
    } else {
      request.resolve(data);
    }
    this.pendingRequests.delete(requestId);
  }

  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    config: string | QueryConfig<I>,
    values?: I,
  ): Promise<QueryResult<R>> {
    return this.localPool.query(config, values);
  }

  worker<T>(task: (client: IParallelClient) => Promise<T>): Promise<T> {
    if (this.config.maxWorkers === 0) {
      return Promise.reject(
        new Error("No workers available. Configure 'maxWorkers' to be greater than 0 to use this feature."),
      );
    }
    if (this.isShutdown) {
      return Promise.reject(new Error('No workers available. Instance has been shut down.'));
    }
    this.ensureWorkersInitialized();
    const worker = this.getNextWorker();
    const clientId = uuidv4();
    const client = new ParallelClient(clientId, this, worker);

    const requestId = uuidv4();
    const promise = new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
    });

    worker.postMessage({ type: 'worker', clientId, requestId, payload: { task: task.toString() } });
    return promise;
  }

  task<T, A extends any[]>(fn: (...args: A) => T | Promise<T>, args: A): Promise<T> {
    if (this.config.maxWorkers === 0) {
      return Promise.reject(
        new Error("No workers available. Configure 'maxWorkers' to be greater than 0 to use this feature."),
      );
    }
    if (this.isShutdown) {
      return Promise.reject(new Error('No workers available. Instance has been shut down.'));
    }
    this.ensureWorkersInitialized();
    const worker = this.getNextWorker();
    const requestId = uuidv4();
    const promise = new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
    });

    worker.postMessage({ type: 'task', requestId, payload: { task: fn.toString(), args } });
    return promise;
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

  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }
    this.isShutdown = true;

    await this.localPool.end();
    if (this.workers.length > 0) {
      await Promise.all(this.workers.map((worker) => worker.terminate()));
      this.workers = [];
    }
  }

  private getNextWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error("No workers available. Configure 'maxWorkers' to be greater than 0 to use this feature.");
    }
    const worker = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
    return worker;
  }
}
