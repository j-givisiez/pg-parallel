import { PoolConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';

/**
 * The client proxy returned by `pgParallel.worker()`.
 * It provides a safe way to interact with a database client in a worker thread.
 */
export interface IParallelClient {
  /**
   * The unique identifier for this client instance.
   */
  readonly id: string;

  /**
   * Executes a database query.
   *
   * @param config The query configuration object or the SQL query string.
   * @param values The values to substitute for placeholders in the query.
   */
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    config: QueryConfig<I> | string,
    values?: I,
  ): Promise<QueryResult<R>>;
}

/**
 * Defines the public interface for the PgParallel class.
 */
export interface IPgParallel {
  /**
   * Executes a single, non-blocking query on the main thread for optimal
   * performance in pure I/O tasks.
   */
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    config: QueryConfig<I> | string,
    values?: I,
  ): Promise<QueryResult<R>>;

  /**
   * Executes a scoped function within a dedicated worker thread, providing a
   * client for database operations. Ideal for transactions and mixed workloads.
   * The client is automatically managed.
   */
  worker<T>(task: (client: IParallelClient) => Promise<T>): Promise<T>;
  worker<T>(task: WorkerFileTask): Promise<T>;

  /**
   * Executes a pure CPU-bound task in an available worker thread without
   * providing a database client.
   */
  task<T, A extends any[]>(fn: (...args: A) => T | Promise<T>, args: A): Promise<T>;

  /**
   * Terminates all workers and closes all database connections.
   */
  shutdown(): Promise<void>;
}

/**
 * Configuration for the PgParallel manager.
 */
export interface PgParallelConfig extends PoolConfig {
  /**
   * The number of worker threads to spawn.
   * @default os.cpus().length
   */
  maxWorkers?: number;
}

/**
 * Represents a task to be executed from a file in a worker thread.
 */
export interface WorkerFileTask {
  /**
   * The absolute path to the module file.
   */
  taskPath: string;
  /**
   * The name of the exported function to execute. Defaults to 'handler'.
   */
  taskName?: string;
  /**
   * An array of arguments to pass to the file-based task function.
   */
  args?: any[];
}
