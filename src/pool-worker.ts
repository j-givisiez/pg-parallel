/**
 * @file This script runs in a separate worker thread to handle database connections.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { parentPort, workerData, threadId } from 'worker_threads';

if (!parentPort) {
  throw new Error('This script must be run as a worker thread.');
}

interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter?: boolean;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxCalls: number;
  halfOpenSuccessesToClose: number;
}

const {
  poolConfig,
  retry: retryConfig,
  circuitBreaker: circuitConfig,
  enableWorkerLogs,
} = workerData as {
  poolConfig: PoolConfig;
  retry?: RetryConfig | null;
  circuitBreaker?: CircuitBreakerConfig | null;
  enableWorkerLogs?: boolean;
};
const pool = new Pool(poolConfig);
const activeClients = new Map<string, PoolClient>();

pool.on('error', (err) => {
  if (enableWorkerLogs) {
    console.error('Idle client in worker pool encountered an error', err);
  }
});

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
let breakerState: BreakerState = 'CLOSED';
let consecutiveFailures = 0;
let breakerOpenedAt = 0;
let halfOpenAllowedCalls = 0;
let halfOpenSuccesses = 0;

function getCircuitCfg(): CircuitBreakerConfig {
  return (
    circuitConfig ?? {
      failureThreshold: 5,
      cooldownMs: 10_000,
      halfOpenMaxCalls: 2,
      halfOpenSuccessesToClose: 2,
    }
  );
}

async function ensureBreakerState(): Promise<void> {
  if (breakerState === 'OPEN') {
    const cfg = getCircuitCfg();
    const elapsed = Date.now() - breakerOpenedAt;
    if (elapsed >= cfg.cooldownMs) {
      breakerState = 'HALF_OPEN';
      halfOpenSuccesses = 0;
      if (enableWorkerLogs) console.info('Worker breaker HALF_OPEN');
      halfOpenAllowedCalls = cfg.halfOpenMaxCalls;
    }
  }
  if (breakerState === 'HALF_OPEN') {
    if (halfOpenAllowedCalls <= 0) {
      throw new Error('Worker circuit breaker trial limit reached');
    }
    halfOpenAllowedCalls -= 1;
  }
}

function onBreakerSuccess(): void {
  if (breakerState === 'HALF_OPEN') {
    halfOpenSuccesses += 1;
    const cfg = getCircuitCfg();
    if (halfOpenSuccesses >= cfg.halfOpenSuccessesToClose) {
      breakerState = 'CLOSED';
      consecutiveFailures = 0;
      if (enableWorkerLogs) console.info('Worker breaker CLOSED');
    }
  } else {
    consecutiveFailures = 0;
  }
}

function openBreaker(): void {
  const cfg = getCircuitCfg();
  breakerState = 'OPEN';
  breakerOpenedAt = Date.now();
  halfOpenAllowedCalls = cfg.halfOpenMaxCalls;
  halfOpenSuccesses = 0;
  if (enableWorkerLogs) console.warn('Worker breaker OPENED');
}

function onBreakerFailure(): void {
  const cfg = getCircuitCfg();
  consecutiveFailures += 1;
  if (breakerState === 'HALF_OPEN') {
    openBreaker();
    return;
  }
  if (consecutiveFailures >= cfg.failureThreshold && breakerState === 'CLOSED') {
    openBreaker();
  }
}

function isTransient(error: any): boolean {
  const code: string | undefined = error?.code;
  const message: string | undefined = error?.message;
  if (code === '40001' || code === '40P01') return true; // serialization/deadlock
  if (code === 'ETIMEDOUT' || code === '57014') return true; // timeout
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === '57P01' || code === '57P02') return true; // conn
  if (message && /timeout|deadlock|connection/i.test(message)) return true;
  return false;
}

async function executeWithRetry<T>(fn: () => Promise<T>, opName: string): Promise<T> {
  if (!retryConfig) return fn();
  let attempt = 0;
  let delay = Math.max(0, retryConfig.initialDelayMs);
  const maxDelay = Math.max(delay, retryConfig.maxDelayMs);
  while (true) {
    attempt += 1;
    try {
      if (attempt > 1 && enableWorkerLogs) console.info('Retrying worker op', { opName, attempt });
      return await fn();
    } catch (err) {
      const canRetry = attempt < retryConfig.maxAttempts && isTransient(err);
      if (!canRetry) throw err;
      const jitter = retryConfig.jitter ? Math.random() * 0.25 * delay : 0;
      const wait = Math.min(maxDelay, delay + jitter);
      await new Promise((r) => setTimeout(r, wait));
      delay = Math.min(maxDelay, Math.ceil(delay * retryConfig.backoffFactor));
    }
  }
}

async function executeWithBreakerAndRetry<T>(fn: () => Promise<T>, opName: string): Promise<T> {
  await ensureBreakerState();
  if (breakerState === 'OPEN') {
    throw new Error('Worker circuit breaker is open');
  }
  const execOnce = async () => {
    try {
      const result = await fn();
      onBreakerSuccess();
      return result;
    } catch (err) {
      onBreakerFailure();
      throw err;
    }
  };
  return executeWithRetry(execOnce, opName);
}

async function connectClient(): Promise<PoolClient> {
  return executeWithBreakerAndRetry(() => pool.connect(), 'worker.connect');
}

function createResilientClient(base: PoolClient): { query: PoolClient['query'] } {
  const safeQuery = ((textOrConfig: any, values?: any) => {
    return executeWithBreakerAndRetry(() => base.query(textOrConfig as any, values as any), 'worker.query');
  }) as unknown as PoolClient['query'];
  return { query: safeQuery } as any;
}

interface WorkerMessage {
  type: 'worker' | 'task' | 'query';
  requestId: string;
  payload: any;
  clientId?: string;
}

parentPort.on('message', async (message: WorkerMessage) => {
  const { type, requestId, payload, clientId } = message;
  const workerId = threadId.toString();

  try {
    let result: any;

    if (type === 'worker') {
      if (payload.workerFile) {
        const client = await connectClient();
        try {
          const taskModule = require(payload.workerFile.taskPath);
          const taskName = payload.workerFile.taskName || 'handler';
          if (typeof taskModule[taskName] !== 'function') {
            throw new Error(`Task '${taskName}' not found or not a function in ${payload.workerFile.taskPath}`);
          }
          const taskArgs = payload.workerFile.args || [];
          const resilient = createResilientClient(client);
          result = await taskModule[taskName](resilient, ...taskArgs);
        } finally {
          client.release();
        }
      } else if (payload.clientId) {
        const client = await connectClient();
        activeClients.set(payload.clientId, client);
        try {
          const resilient = createResilientClient(client);
          const taskFunction = new Function('client', `return (${payload.task})(client)`);
          result = await taskFunction(resilient);
        } finally {
          client.release();
          activeClients.delete(payload.clientId);
        }
      } else {
        const client = await connectClient();
        try {
          const resilient = createResilientClient(client);
          const taskFunction = new Function('client', `return (${payload.task})(client)`);
          result = await taskFunction(resilient);
        } finally {
          client.release();
        }
      }
    } else if (type === 'task') {
      const taskFunction = new Function('...args', `return (${payload.task})(...args)`);
      result = await taskFunction(...payload.args);
    } else if (type === 'query') {
      if (!clientId) throw new Error('Missing clientId for query.');
      const client = activeClients.get(clientId);
      if (!client) throw new Error(`Query failed: Client ${clientId} not found.`);

      const { text, values, ...config } = payload;
      result = await executeWithBreakerAndRetry(
        () => (text ? client.query(text, values) : client.query(config)),
        'worker.query',
      );
    }

    const sanitizedResult = result && typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : result;

    parentPort?.postMessage({ requestId, workerId, data: sanitizedResult });
  } catch (err: any) {
    parentPort?.postMessage({ requestId, workerId, error: { message: err.message } });
    if (clientId && activeClients.has(clientId)) {
      const client = activeClients.get(clientId);
      if (client) {
        client.release();
        activeClients.delete(clientId);
      }
    }
  }
});

if (enableWorkerLogs) console.log('Worker thread started successfully');
