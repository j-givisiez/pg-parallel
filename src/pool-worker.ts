/**
 * @file This script runs in a separate worker thread to handle database connections.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { parentPort, workerData, threadId } from 'worker_threads';

if (!parentPort) {
  throw new Error('This script must be run as a worker thread.');
}

const { poolConfig } = workerData as { poolConfig: PoolConfig };
const pool = new Pool(poolConfig);
const activeClients = new Map<string, PoolClient>();

pool.on('error', (err) => {
  console.error('Idle client in worker pool encountered an error', err);
});

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
        const client = await pool.connect();
        try {
          const taskModule = require(payload.workerFile.taskPath);
          const taskName = payload.workerFile.taskName || 'handler';
          if (typeof taskModule[taskName] !== 'function') {
            throw new Error(`Task '${taskName}' not found or not a function in ${payload.workerFile.taskPath}`);
          }
          const taskArgs = payload.workerFile.args || [];
          result = await taskModule[taskName](client, ...taskArgs);
        } finally {
          client.release();
        }
      } else if (payload.clientId) {
        const client = await pool.connect();
        activeClients.set(payload.clientId, client);
        try {
          const taskFunction = new Function('client', `return (${payload.task})(client)`);
          result = await taskFunction(client);
        } finally {
          client.release();
          activeClients.delete(payload.clientId);
        }
      } else {
        const client = await pool.connect();
        try {
          const taskFunction = new Function('client', `return (${payload.task})(client)`);
          result = await taskFunction(client);
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
      result = text ? await client.query(text, values) : await client.query(config);
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

console.log('Worker thread started successfully');
