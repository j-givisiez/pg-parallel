/**
 * @file Enhanced I/O benchmark with detailed performance metrics
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { PgParallel } from '../pg-parallel';
import { PerformanceBenchmark } from './performance-metrics';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

/**
 * Enhanced I/O benchmark with multiple load scenarios
 */
const runEnhancedIOBenchmark = async () => {
  console.log('Enhanced I/O Performance Benchmark');
  console.log('=====================================');

  const scenarios = [
    { name: 'Light Load', operations: 1000, concurrency: 10 },
    { name: 'Medium Load', operations: 5000, concurrency: 50 },
    { name: 'Heavy Load', operations: 10000, concurrency: 100 },
  ];

  for (const scenario of scenarios) {
    console.log(`\nTesting Scenario: ${scenario.name}`);
    console.log('-'.repeat(50));

    // Create and warmup pg-parallel instance ONCE
    const db = new PgParallel({
      connectionString: process.env.DATABASE_URL!,
      max: Math.min(scenario.concurrency + 10, 100),
      maxWorkers: Math.min(4, Math.ceil(scenario.concurrency / 25)), // More workers for higher concurrency
    });

    console.log('Warming up pg-parallel...');
    await db.warmup(); // Critical warmup step!

    // Test pg-parallel with pre-warmed instance
    const pgParallelMetrics = await PerformanceBenchmark.runBenchmark(
      {
        name: `pg-parallel I/O - ${scenario.name}`,
        operations: scenario.operations,
        concurrency: scenario.concurrency,
        warmupOps: Math.min(100, scenario.operations / 10),
        trackMemory: true,
      },
      async () => {
        await db.query('SELECT 1 as test_value, NOW() as current_time');
      },
    );

    // Create and pre-warm pg.Pool instance ONCE for fair comparison
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: Math.min(scenario.concurrency + 10, 100),
    });

    // Test standard pg.Pool for comparison
    const pgPoolMetrics = await PerformanceBenchmark.runBenchmark(
      {
        name: `pg.Pool I/O - ${scenario.name}`,
        operations: scenario.operations,
        concurrency: scenario.concurrency,
        warmupOps: Math.min(100, scenario.operations / 10),
        trackMemory: true,
      },
      async () => {
        await pool.query('SELECT 1 as test_value, NOW() as current_time');
      },
    );

    // Compare results
    PerformanceBenchmark.compareMetrics(pgPoolMetrics, pgParallelMetrics, 'pg.Pool', 'pg-parallel');

    // Cleanup instances
    await db.shutdown();
    await pool.end();
  }
};

/**
 * Connection pool stress test
 */
const runConnectionStressTest = async () => {
  console.log('\nConnection Pool Stress Test');
  console.log('==============================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    maxWorkers: 4, // Use more workers for stress test
  });

  console.log('Warming up for stress test...');
  await db.warmup(); // Warmup before stress test

  const stressMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Connection Pool Stress',
      operations: 2000,
      concurrency: 200, // Higher than pool size to test queuing
      warmupOps: 50,
      trackMemory: true,
    },
    async () => {
      await db.query('SELECT pg_sleep(0.01), generate_series(1, 10)');
    },
  );

  await db.shutdown();

  console.log('\nStress Test Analysis:');
  console.log(`Max Latency (P99): ${stressMetrics.p99Latency.toFixed(2)}ms`);
  console.log(`Latency Std Dev: ${stressMetrics.latencyStdDev.toFixed(2)}ms`);
  console.log(`Peak Memory: ${stressMetrics.memory.peakUsageMB.toFixed(2)}MB`);

  if (stressMetrics.errors.count > 0) {
    console.log(`⚠️  Errors under stress: ${stressMetrics.errors.count} (${stressMetrics.errors.rate.toFixed(2)}%)`);
  } else {
    console.log('✅ No errors under high connection stress');
  }
};

/**
 * Query complexity benchmark
 */
const runQueryComplexityBenchmark = async () => {
  console.log('\nQuery Complexity Benchmark');
  console.log('==============================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 50,
    maxWorkers: 2, // Use some workers for mixed workload
  });

  console.log('Warming up for complexity test...');
  await db.warmup(); // Warmup before complexity test

  const queries = [
    {
      name: 'Simple SELECT',
      query: 'SELECT 1',
      operations: 5000,
    },
    {
      name: 'Aggregation Query',
      query: 'SELECT COUNT(*), AVG(num), MAX(num) FROM generate_series(1, 1000) as num',
      operations: 1000,
    },
    {
      name: 'Complex Join',
      query: `
        SELECT a.num, b.num, a.num * b.num as product 
        FROM generate_series(1, 100) a(num) 
        CROSS JOIN generate_series(1, 10) b(num) 
        WHERE a.num % 7 = b.num % 3
        ORDER BY product DESC 
        LIMIT 50
      `,
      operations: 500,
    },
  ];

  const results: Array<{ name: string; metrics: any }> = [];

  for (const queryTest of queries) {
    const metrics = await PerformanceBenchmark.runBenchmark(
      {
        name: queryTest.name,
        operations: queryTest.operations,
        concurrency: 20,
        warmupOps: 10,
        trackMemory: true,
      },
      async () => {
        await db.query(queryTest.query);
      },
    );

    results.push({ name: queryTest.name, metrics });
  }

  await db.shutdown();

  // Display complexity analysis
  console.log('\nQuery Complexity Analysis:');
  console.log('Query Type'.padEnd(20) + 'Throughput'.padEnd(15) + 'Avg Latency'.padEnd(15) + 'P95 Latency');
  console.log('-'.repeat(65));

  results.forEach((result) => {
    const name = result.name.padEnd(20);
    const throughput = `${result.metrics.throughput.toFixed(1)} ops/s`.padEnd(15);
    const avgLat = `${result.metrics.avgLatency.toFixed(2)}ms`.padEnd(15);
    const p95Lat = `${result.metrics.p95Latency.toFixed(2)}ms`;
    console.log(name + throughput + avgLat + p95Lat);
  });
};

/**
 * Main execution function
 */
const main = async () => {
  try {
    await runEnhancedIOBenchmark();
    await runConnectionStressTest();
    await runQueryComplexityBenchmark();

    console.log('\nEnhanced I/O benchmarks completed successfully!');
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

export { runEnhancedIOBenchmark, runConnectionStressTest, runQueryComplexityBenchmark };
