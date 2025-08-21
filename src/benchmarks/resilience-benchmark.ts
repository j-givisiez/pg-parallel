/**
 * @file Resilience and fault tolerance benchmark tests
 */

import 'dotenv/config';
import { PgParallel } from '../pg-parallel';
import { PerformanceBenchmark } from './performance-metrics';
import type { ErrorCategory } from '../types';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

/**
 * Tests circuit breaker functionality under high failure rates
 */
const runCircuitBreakerTest = async () => {
  console.log('\n⚡ Circuit Breaker Resilience Test');
  console.log('==================================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    maxWorkers: 4,
    circuitBreaker: {
      failureThreshold: 3,
      cooldownMs: 2000,
      halfOpenMaxCalls: 2,
      halfOpenSuccessesToClose: 2,
    },
    logger: {
      info: (msg) => console.log(`🔵 ${msg}`),
      warn: (msg) => console.log(`🟡 ${msg}`),
      error: (msg) => console.log(`🔴 ${msg}`),
    },
  });

  // Phase 1: Trigger circuit breaker with failures
  console.log('\n📊 Phase 1: Triggering failures to open circuit breaker...');

  const failureMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Circuit Breaker Failure Phase',
      operations: 20,
      concurrency: 5,
      trackMemory: true,
    },
    async () => {
      try {
        // Intentionally failing query
        await db.query('SELECT * FROM non_existent_table_for_testing');
      } catch (error) {
        // Expected to fail
      }
    },
  );

  console.log(`Failure phase error rate: ${failureMetrics.errors.rate.toFixed(2)}%`);

  // Phase 2: Test circuit breaker blocking
  console.log('\n📊 Phase 2: Testing circuit breaker blocking...');

  await new Promise((resolve) => setTimeout(resolve, 500)); // Brief pause

  const blockingMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Circuit Breaker Blocking Phase',
      operations: 10,
      concurrency: 3,
      trackMemory: false,
    },
    async () => {
      try {
        await db.query('SELECT 1'); // Should be blocked by circuit breaker
      } catch (error) {
        // Expected to be blocked
      }
    },
  );

  console.log(`Blocking phase error rate: ${blockingMetrics.errors.rate.toFixed(2)}%`);

  // Phase 3: Wait for cooldown and recovery
  console.log('\n📊 Phase 3: Waiting for circuit breaker recovery...');
  await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for cooldown

  const recoveryMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Circuit Breaker Recovery Phase',
      operations: 10,
      concurrency: 2,
      trackMemory: false,
    },
    async () => {
      await db.query('SELECT 1 as recovery_test'); // Should succeed and close circuit
    },
  );

  console.log(`Recovery phase error rate: ${recoveryMetrics.errors.rate.toFixed(2)}%`);

  await db.shutdown();

  // Analyze circuit breaker effectiveness
  if (blockingMetrics.avgLatency < failureMetrics.avgLatency) {
    console.log('✅ Circuit breaker effectively reduced latency during failures');
  } else {
    console.log('⚠️  Circuit breaker may not be working optimally');
  }

  if (recoveryMetrics.errors.rate < 10) {
    console.log('✅ Circuit breaker recovered successfully');
  } else {
    console.log('❌ Circuit breaker recovery issues detected');
  }
};

/**
 * Tests retry mechanism with different error scenarios
 */
const runRetryMechanismTest = async () => {
  console.log('\n🔄 Retry Mechanism Test');
  console.log('=======================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    maxWorkers: 4,
    retry: {
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
      jitter: true,
    },
    logger: {
      info: (msg) => console.log(`🔵 ${msg}`),
      warn: (msg) => console.log(`🟡 ${msg}`),
      error: (msg) => console.log(`🔴 ${msg}`),
    },
  });

  // Test transient error scenarios
  const scenarios = [
    {
      name: 'Simulated Connection Timeout',
      operation: async () => {
        // Simulate heavy query that might timeout
        await db.query('SELECT pg_sleep(0.001), generate_series(1, 1000)');
      },
    },
    {
      name: 'Worker Task with Retry',
      operation: async () => {
        let attempt = 0;
        await db.task(() => {
          attempt++;
          if (attempt < 2) {
            throw new Error('Simulated transient worker error');
          }
          return 'success';
        }, []);
      },
    },
    {
      name: 'Database Connection Recovery',
      operation: async () => {
        await db.worker(async (client) => {
          const { rows } = await client.query('SELECT 1 as test');
          return rows[0].test;
        });
      },
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n🧪 Testing: ${scenario.name}`);

    const metrics = await PerformanceBenchmark.runBenchmark(
      {
        name: scenario.name,
        operations: 20,
        concurrency: 5,
        trackMemory: false,
      },
      scenario.operation,
    );

    console.log(`   Success rate: ${(100 - metrics.errors.rate).toFixed(2)}%`);
    console.log(`   Avg latency: ${metrics.avgLatency.toFixed(2)}ms`);

    if (metrics.errors.rate < 5) {
      console.log(`   ✅ ${scenario.name} handled well`);
    } else {
      console.log(`   ⚠️  High error rate in ${scenario.name}`);
    }
  }

  await db.shutdown();
};

/**
 * Tests error categorization accuracy
 */
const runErrorCategorizationTest = async () => {
  console.log('\n🏷️  Error Categorization Test');
  console.log('=============================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 10,
    maxWorkers: 2,
  });

  const errorTests = [
    {
      name: 'Syntax Error',
      operation: () => db.query('SELCT 1'), // Intentional typo
      expectedCategory: 'SYNTAX' as ErrorCategory,
    },
    {
      name: 'Constraint Violation',
      operation: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS temp_constraint_test (
            id INT PRIMARY KEY, 
            value TEXT
          )
        `);
        await db.query("INSERT INTO temp_constraint_test (id, value) VALUES (1, 'test')");
        await db.query("INSERT INTO temp_constraint_test (id, value) VALUES (1, 'duplicate')");
      },
      expectedCategory: 'CONSTRAINT' as ErrorCategory,
    },
    {
      name: 'Missing Table',
      operation: () => db.query('SELECT * FROM definitely_non_existent_table_12345'),
      expectedCategory: 'SYNTAX' as ErrorCategory,
    },
  ];

  const errorResults: Array<{
    name: string;
    actualCategory: ErrorCategory;
    expectedCategory: ErrorCategory;
    correct: boolean;
  }> = [];

  for (const test of errorTests) {
    console.log(`\n🧪 Testing: ${test.name}`);

    try {
      await test.operation();
      console.log('   ⚠️  Expected error but operation succeeded');
    } catch (error: any) {
      // Extract error category from error (assuming it's wrapped in PgParallelError)
      const actualCategory = error.category || ('UNKNOWN' as ErrorCategory);
      const correct = actualCategory === test.expectedCategory;

      console.log(`   Expected: ${test.expectedCategory}`);
      console.log(`   Actual: ${actualCategory}`);
      console.log(`   ${correct ? '✅' : '❌'} Categorization ${correct ? 'correct' : 'incorrect'}`);

      errorResults.push({
        name: test.name,
        actualCategory,
        expectedCategory: test.expectedCategory,
        correct,
      });
    }
  }

  // Cleanup
  try {
    await db.query('DROP TABLE IF EXISTS temp_constraint_test');
  } catch {
    // Ignore cleanup errors
  }

  await db.shutdown();

  // Analyze categorization accuracy
  const correctCount = errorResults.filter((r) => r.correct).length;
  const totalTests = errorResults.length;
  const accuracy = (correctCount / totalTests) * 100;

  console.log(`\n📊 Error Categorization Accuracy: ${accuracy.toFixed(1)}% (${correctCount}/${totalTests})`);

  if (accuracy >= 80) {
    console.log('✅ Error categorization is working well');
  } else {
    console.log('⚠️  Error categorization needs improvement');
  }
};

/**
 * Tests system behavior under network instability simulation
 */
const runNetworkInstabilityTest = async () => {
  console.log('\n🌐 Network Instability Simulation');
  console.log('==================================');

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL!,
    max: 20,
    maxWorkers: 4,
    retry: {
      maxAttempts: 3,
      initialDelayMs: 50,
      maxDelayMs: 500,
      backoffFactor: 2,
      jitter: true,
    },
    circuitBreaker: {
      failureThreshold: 5,
      cooldownMs: 1000,
      halfOpenMaxCalls: 2,
      halfOpenSuccessesToClose: 2,
    },
  });

  // Simulate network instability with varying success rates
  let operationCount = 0;
  const networkFailureRate = 0.1; // 10% simulated network failures

  const instabilityMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Network Instability Simulation',
      operations: 200,
      concurrency: 20,
      trackMemory: true,
    },
    async () => {
      operationCount++;

      // Simulate network instability
      if (Math.random() < networkFailureRate && operationCount % 3 === 0) {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

        // Sometimes fail completely
        if (Math.random() < 0.3) {
          throw new Error('Simulated network timeout');
        }
      }

      // Normal operation
      const operations = [
        () => db.query('SELECT 1, pg_sleep(0.001)'),
        () => db.task((x: number) => x * 2, [Math.random()]),
        () =>
          db.worker(async (client) => {
            const { rows } = await client.query('SELECT random()');
            return rows[0].random;
          }),
      ];

      const randomOp = operations[Math.floor(Math.random() * operations.length)];
      await randomOp();
    },
  );

  await db.shutdown();

  console.log('\n📊 Network Instability Results:');
  console.log(`Error Rate: ${instabilityMetrics.errors.rate.toFixed(2)}%`);
  console.log(`Throughput: ${instabilityMetrics.throughput.toFixed(2)} ops/sec`);
  console.log(`P95 Latency: ${instabilityMetrics.p95Latency.toFixed(2)}ms`);
  console.log(`Latency Std Dev: ${instabilityMetrics.latencyStdDev.toFixed(2)}ms`);

  // Assess resilience
  if (instabilityMetrics.errors.rate < 15 && instabilityMetrics.throughput > 50) {
    console.log('✅ System shows good resilience to network instability');
  } else if (instabilityMetrics.errors.rate < 30) {
    console.log('⚠️  System handles network instability with some degradation');
  } else {
    console.log('❌ Poor resilience to network instability');
  }
};

/**
 * Main execution function
 */
const main = async () => {
  const testType = process.argv[2] || 'all';

  try {
    console.log('🛡️  Resilience & Fault Tolerance Test Suite');
    console.log('===========================================');

    if (testType === 'all' || testType === 'circuit-breaker') {
      await runCircuitBreakerTest();
    }

    if (testType === 'all' || testType === 'retry') {
      await runRetryMechanismTest();
    }

    if (testType === 'all' || testType === 'error-categorization') {
      await runErrorCategorizationTest();
    }

    if (testType === 'all' || testType === 'network') {
      await runNetworkInstabilityTest();
    }

    console.log('\n🎉 Resilience tests completed successfully!');
    console.log('\nUsage: ts-node resilience-benchmark.ts [circuit-breaker|retry|error-categorization|network|all]');
  } catch (error) {
    console.error('❌ Resilience test suite failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

export { runCircuitBreakerTest, runRetryMechanismTest, runErrorCategorizationTest, runNetworkInstabilityTest };
