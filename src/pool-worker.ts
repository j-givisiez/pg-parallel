/**
 * @file This script runs in a separate worker thread to handle database connections.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { parentPort, workerData, threadId } from 'worker_threads';
import { RetryConfig, CircuitBreakerConfig } from './types';
import { ErrorUtils } from './utils/ErrorUtils';
import { RetryUtils } from './utils/RetryUtils';
import { CircuitBreakerUtils, CircuitBreakerState } from './utils/CircuitBreakerUtils';

if (!parentPort) {
  throw new Error('This script must be run as a worker thread.');
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

let breakerState: CircuitBreakerState = CircuitBreakerUtils.createInitialState();

function getCircuitCfg(): CircuitBreakerConfig {
  return circuitConfig ?? CircuitBreakerUtils.getDefaultConfig();
}

async function ensureBreakerState(): Promise<void> {
  const cfg = getCircuitCfg();
  const logger = enableWorkerLogs
    ? {
        info: (message: string) => console.info(message),
        warn: (message: string) => console.warn(message),
      }
    : undefined;

  await CircuitBreakerUtils.ensureBreakerState(breakerState, cfg, logger);
}

function onBreakerSuccess(): void {
  const cfg = getCircuitCfg();
  const logger = enableWorkerLogs
    ? {
        info: (message: string) => console.info(message),
      }
    : undefined;

  CircuitBreakerUtils.onBreakerSuccess(breakerState, cfg, logger);
}

function onBreakerFailure(): void {
  const cfg = getCircuitCfg();
  const logger = enableWorkerLogs
    ? {
        warn: (message: string) => console.warn(message),
      }
    : undefined;

  CircuitBreakerUtils.onBreakerFailure(breakerState, cfg, logger);
}

async function executeWithRetry<T>(fn: () => Promise<T>, opName: string): Promise<T> {
  if (!retryConfig) return fn();

  const logger = enableWorkerLogs
    ? {
        info: (message: string, meta?: Record<string, unknown>) => console.info(message, meta),
      }
    : undefined;

  return RetryUtils.executeWithRetry(fn, retryConfig, opName, logger);
}

async function executeWithBreakerAndRetry<T>(fn: () => Promise<T>, opName: string): Promise<T> {
  await ensureBreakerState();
  if (breakerState.state === 'OPEN') {
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
