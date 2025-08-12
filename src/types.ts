import { PoolConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';

/**
 * Categorization for database and execution errors to enable
 * consistent handling, retries, and monitoring.
 */
export type ErrorCategory =
  | 'TRANSIENT'
  | 'CONNECTION'
  | 'TIMEOUT'
  | 'DEADLOCK'
  | 'SERIALIZATION'
  | 'CONSTRAINT'
  | 'SYNTAX'
  | 'UNKNOWN';

/**
 * A standardized error type that wraps underlying errors with a category.
 */
export class PgParallelError extends Error {
  public readonly category: ErrorCategory;
  public readonly cause?: unknown;

  constructor(message: string, category: ErrorCategory, cause?: unknown) {
    super(message);
    this.name = 'PgParallelError';
    this.category = category;
    this.cause = cause;
  }
}

/**
 * Logger interface used to emit diagnostic information without
 * coupling to a specific logging library.
 */
export interface Logger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Configuration for automatic retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of attempts, including the initial try. */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds. */
  initialDelayMs: number;
  /** Maximum backoff delay in milliseconds. */
  maxDelayMs: number;
  /** Exponential backoff multiplier. */
  backoffFactor: number;
  /** Add jitter to mitigate thundering herd problems. */
  jitter?: boolean;
  /** Custom predicate to decide whether an error should be retried. */
  retryOn?: (error: unknown) => boolean;
}

/**
 * Configuration for a simple circuit breaker around database operations.
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures to open the breaker. */
  failureThreshold: number;
  /** Cooldown period in milliseconds while the breaker is open. */
  cooldownMs: number;
  /** Max number of trial calls in half-open state. */
  halfOpenMaxCalls: number;
  /** Number of successes in half-open to close the breaker. */
  halfOpenSuccessesToClose: number;
}

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
  /** Optional logger for diagnostic events. */
  logger?: Logger;
  /** Optional retry configuration for transient failures. */
  retry?: RetryConfig;
  /** Optional circuit breaker configuration for database operations. */
  circuitBreaker?: CircuitBreakerConfig;
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
