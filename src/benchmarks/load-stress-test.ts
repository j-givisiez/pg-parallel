/**
 * @file Comprehensive load and stress tests for pg-parallel
 */

import 'dotenv/config';
import { performance } from 'perf_hooks';
import { PgParallel } from '../pg-parallel';
import { PerformanceBenchmark } from './performance-metrics';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

/**
 * Fibonacci task for CPU stress testing
 */
const fibonacciTask = (n: number): number => {
  if (n <= 1) return n;
  return fibonacciTask(n - 1) + fibonacciTask(n - 2);
};

/**
 * High concurrency load test
 */
const runHighConcurrencyTest = async () => {
  console.log('\n🚀 High Concurrency Load Test');
  console.log('==============================');

  const concurrencyLevels = [50, 100, 200, 500];

  for (const concurrency of concurrencyLevels) {
    console.log(`\n📊 Testing ${concurrency} concurrent operations`);

    const db = new PgParallel({
      connectionString: process.env.DATABASE_URL!,
      max: Math.min(concurrency, 100),
      maxWorkers: Math.min(Math.ceil(concurrency / 10), 8),
    });

    const metrics = await PerformanceBenchmark.runBenchmark(
      {
        name: `Concurrency ${concurrency}`,
        operations: concurrency * 2, // 2x operations vs concurrency
        concurrency,
        warmupOps: Math.min(concurrency, 50),
        trackMemory: true,
      },
      async () => {
        // Mix of I/O and CPU operations
        const operations = [
          () => db.query('SELECT generate_series(1, 10), random()'),
          () => db.task(fibonacciTask, [25]), // Lighter CPU task for load test
          () =>
            db.worker(async (client) => {
              await client.query('SELECT pg_sleep(0.001)');
              return Math.random();
            }),
        ];

        const randomOp = operations[Math.floor(Math.random() * operations.length)];
        await randomOp();
      },
    );

    await db.shutdown();

    // Analyze performance degradation
    const acceptableLatency = 1000; // 1 second
    const acceptableErrorRate = 1; // 1%

    console.log(`📈 Results for ${concurrency} concurrency:`);
    console.log(`   Throughput: ${metrics.throughput.toFixed(2)} ops/sec`);
    console.log(`   P95 Latency: ${metrics.p95Latency.toFixed(2)}ms`);
    console.log(`   Error Rate: ${metrics.errors.rate.toFixed(2)}%`);

    if (metrics.p95Latency > acceptableLatency) {
      console.log(`⚠️  High latency detected at ${concurrency} concurrency`);
    }

    if (metrics.errors.rate > acceptableErrorRate) {
      console.log(`❌ High error rate at ${concurrency} concurrency`);
    } else {
      console.log(`✅ Stable at ${concurrency} concurrency`);
    }
  }
};

/**
 * Memory leak detection test
 */
const runMemoryLeakTest = async () => {
  console.log('\n🧠 Memory Leak Detection Test');
  console.log('==============================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    maxWorkers: 4,
  });

  const iterations = 10;
  const operationsPerIteration = 500;
  const memorySnapshots: number[] = [];

  console.log(`Running ${iterations} iterations of ${operationsPerIteration} operations each...`);

  for (let i = 0; i < iterations; i++) {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const beforeMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    // Run batch of operations
    const promises = Array.from({ length: operationsPerIteration }, async () => {
      const operations = [
        () => db.query('SELECT generate_series(1, 100)'),
        () => db.task((x: number) => x * 2, [Math.random()]),
        () =>
          db.worker(async (client) => {
            const { rows } = await client.query('SELECT random() as val');
            return rows[0].val;
          }),
      ];

      const randomOp = operations[Math.floor(Math.random() * operations.length)];
      return randomOp();
    });

    await Promise.all(promises);

    // Force garbage collection again
    if (global.gc) {
      global.gc();
    }

    await new Promise((resolve) => setTimeout(resolve, 100)); // Let GC settle

    const afterMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    memorySnapshots.push(afterMemory);

    console.log(`Iteration ${i + 1}: ${afterMemory.toFixed(2)}MB (Δ${(afterMemory - beforeMemory).toFixed(2)}MB)`);
  }

  await db.shutdown();

  // Analyze memory trend
  const firstMemory = memorySnapshots[0];
  const lastMemory = memorySnapshots[memorySnapshots.length - 1];
  const memoryGrowth = lastMemory - firstMemory;
  const avgGrowthPerIteration = memoryGrowth / iterations;

  console.log('\n📋 Memory Analysis:');
  console.log(`Starting Memory: ${firstMemory.toFixed(2)}MB`);
  console.log(`Final Memory: ${lastMemory.toFixed(2)}MB`);
  console.log(`Total Growth: ${memoryGrowth.toFixed(2)}MB`);
  console.log(`Avg Growth/Iteration: ${avgGrowthPerIteration.toFixed(2)}MB`);

  // Check for potential memory leak
  const maxAcceptableGrowth = 50; // 50MB total growth acceptable
  const maxAcceptableAvgGrowth = 2; // 2MB per iteration

  if (memoryGrowth > maxAcceptableGrowth || avgGrowthPerIteration > maxAcceptableAvgGrowth) {
    console.log('⚠️  Potential memory leak detected!');
  } else {
    console.log('✅ No significant memory leak detected');
  }
};

/**
 * Resource exhaustion test
 */
const runResourceExhaustionTest = async () => {
  console.log('\n💥 Resource Exhaustion Test');
  console.log('===========================');

  // Test 1: Connection pool exhaustion
  console.log('\n🔌 Testing connection pool exhaustion...');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 5, // Small pool to trigger exhaustion
    maxWorkers: 2,
    idleTimeoutMillis: 1000,
  });

  const exhaustionMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Connection Pool Exhaustion',
      operations: 100,
      concurrency: 20, // Much higher than pool size
      trackMemory: true,
    },
    async () => {
      await db.query('SELECT pg_sleep(0.1)'); // Hold connections briefly
    },
  );

  console.log(`Pool exhaustion results - Error rate: ${exhaustionMetrics.errors.rate.toFixed(2)}%`);

  await db.shutdown();

  // Test 2: Worker thread exhaustion
  console.log('\n👷 Testing worker thread exhaustion...');

  const workerDb = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    maxWorkers: 2, // Small worker pool
  });

  const workerExhaustionMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Worker Thread Exhaustion',
      operations: 50,
      concurrency: 10, // Higher than worker count
      trackMemory: true,
    },
    async () => {
      await workerDb.task(fibonacciTask, [30]); // CPU intensive task
    },
  );

  console.log(`Worker exhaustion results - Error rate: ${workerExhaustionMetrics.errors.rate.toFixed(2)}%`);

  await workerDb.shutdown();

  // Analyze resilience
  const totalErrorRate = (exhaustionMetrics.errors.rate + workerExhaustionMetrics.errors.rate) / 2;

  if (totalErrorRate < 5) {
    console.log('✅ System handles resource exhaustion gracefully');
  } else if (totalErrorRate < 15) {
    console.log('⚠️  Some degradation under resource exhaustion');
  } else {
    console.log('❌ Poor resilience under resource exhaustion');
  }
};

/**
 * Long-running stability test
 */
const runStabilityTest = async (durationMinutes: number = 5) => {
  console.log(`\n⏰ Long-running Stability Test (${durationMinutes} minutes)`);
  console.log('====================================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 50,
    maxWorkers: 4,
  });

  const endTime = Date.now() + durationMinutes * 60 * 1000;
  let totalOperations = 0;
  let totalErrors = 0;
  const intervalMetrics: Array<{ timestamp: number; ops: number; errors: number; memory: number }> = [];

  console.log('Starting continuous load...');

  const metricsInterval = setInterval(() => {
    const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    intervalMetrics.push({
      timestamp: Date.now(),
      ops: totalOperations,
      errors: totalErrors,
      memory: currentMemory,
    });

    const elapsed = (Date.now() - (endTime - durationMinutes * 60 * 1000)) / 1000;
    const opsPerSec = totalOperations / elapsed;
    console.log(
      `⏱️  ${elapsed.toFixed(0)}s - Ops: ${totalOperations}, Rate: ${opsPerSec.toFixed(1)}/s, Memory: ${currentMemory.toFixed(1)}MB`,
    );
  }, 10000); // Report every 10 seconds

  // Continuous operation loop
  const runContinuousOps = async () => {
    while (Date.now() < endTime) {
      const batchPromises = Array.from({ length: 10 }, async () => {
        try {
          const operations = [
            () => db.query('SELECT random(), generate_series(1, 10)'),
            () => db.task((x: number) => Math.sqrt(x), [Math.random() * 1000]),
            () =>
              db.worker(async (client) => {
                const { rows } = await client.query('SELECT COUNT(*) FROM generate_series(1, 100)');
                return rows[0].count;
              }),
          ];

          const randomOp = operations[Math.floor(Math.random() * operations.length)];
          await randomOp();
          totalOperations++;
        } catch (error) {
          totalErrors++;
        }
      });

      await Promise.all(batchPromises);

      // Small delay to prevent overwhelming
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  await runContinuousOps();
  clearInterval(metricsInterval);
  await db.shutdown();

  // Analyze stability
  const errorRate = (totalErrors / totalOperations) * 100;
  const avgOpsPerSec = totalOperations / (durationMinutes * 60);

  console.log('\n📊 Stability Analysis:');
  console.log(`Total Operations: ${totalOperations}`);
  console.log(`Total Errors: ${totalErrors} (${errorRate.toFixed(2)}%)`);
  console.log(`Average Rate: ${avgOpsPerSec.toFixed(2)} ops/sec`);

  // Check for memory growth over time
  if (intervalMetrics.length > 2) {
    const startMemory = intervalMetrics[1].memory; // Skip first reading
    const endMemory = intervalMetrics[intervalMetrics.length - 1].memory;
    const memoryGrowth = endMemory - startMemory;

    console.log(`Memory Growth: ${memoryGrowth.toFixed(2)}MB over ${durationMinutes} minutes`);

    if (memoryGrowth > durationMinutes * 5) {
      // 5MB per minute threshold
      console.log('⚠️  Significant memory growth detected');
    } else {
      console.log('✅ Stable memory usage');
    }
  }

  if (errorRate < 1 && avgOpsPerSec > 50) {
    console.log('✅ System is stable under continuous load');
  } else {
    console.log('⚠️  Stability issues detected');
  }
};

/**
 * Main execution function
 */
const main = async () => {
  const testSuite = process.argv[2] || 'all';

  try {
    console.log('🧪 Comprehensive Load & Stress Test Suite');
    console.log('=========================================');

    if (testSuite === 'all' || testSuite === 'concurrency') {
      await runHighConcurrencyTest();
    }

    if (testSuite === 'all' || testSuite === 'memory') {
      await runMemoryLeakTest();
    }

    if (testSuite === 'all' || testSuite === 'exhaustion') {
      await runResourceExhaustionTest();
    }

    if (testSuite === 'all' || testSuite === 'stability') {
      const duration = parseInt(process.argv[3]) || 5;
      await runStabilityTest(duration);
    }

    console.log('\n🎉 Load & stress tests completed successfully!');
    console.log(
      '\nUsage: ts-node load-stress-test.ts [concurrency|memory|exhaustion|stability|all] [duration_minutes]',
    );
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

export { runHighConcurrencyTest, runMemoryLeakTest, runResourceExhaustionTest, runStabilityTest };
