/**
 * @file This script runs in a separate worker thread to handle database connections.
 * It manages a dedicated `pg.Pool` and handles client lifecycle events
 * (connect, query, release) as instructed by the main thread.
 */

import { Pool, PoolClient, PoolConfig } from "pg";
import { parentPort, workerData } from "worker_threads";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread.");
}

const { poolConfig } = workerData as { poolConfig: PoolConfig };
const pool = new Pool(poolConfig);
const activeClients = new Map<string, PoolClient>();

pool.on("error", (err) => {
  // This will log errors from idle clients, which is useful for debugging.
  console.error("Idle client in worker pool encountered an error", err);
});

interface WorkerMessage {
  type: "worker_task" | "cpu_task" | "query";
  clientId?: string;
  requestId: string;
  payload: any;
}

parentPort.on("message", async (message: WorkerMessage) => {
  const { type, clientId, requestId, payload } = message;

  try {
    let result: any;
    switch (type) {
      case "worker_task": {
        if (!clientId) throw new Error("Missing clientId for worker_task.");

        const client = await pool.connect();
        activeClients.set(clientId, client);

        try {
          const taskFunction = eval(`(${payload.task})`);
          result = await taskFunction(client);
        } finally {
          client.release();
          activeClients.delete(clientId);
        }
        break;
      }

      case "cpu_task": {
        const taskFunction = eval(`(${payload.task})`);
        result = await taskFunction(...payload.args);
        break;
      }

      case "query": {
        if (!clientId) throw new Error("Missing clientId for query.");
        const client = activeClients.get(clientId);
        if (!client) throw new Error(`Query failed: Client ${clientId} not found.`);

        const { text, values, ...config } = payload;
        result = text ? await client.query(text, values) : await client.query(config);
        break;
      }
    }

    // For queries, we must serialize the result to avoid cloning issues.
    if (type === "query" && result) {
      parentPort?.postMessage({ requestId, data: { ...result, fields: result.fields.map((f: any) => ({ ...f })) } });
    } else {
      parentPort?.postMessage({ requestId, data: result });
    }
  } catch (err: any) {
    parentPort?.postMessage({ requestId, error: { message: err.message } });
    if (clientId) {
      const client = activeClients.get(clientId);
      if (client) {
        client.release();
        activeClients.delete(clientId);
      }
    }
  }
});

console.log("Worker thread started successfully.");
