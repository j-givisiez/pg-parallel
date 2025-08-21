/**
 * @file Tests for performance benchmark utilities and functionality
 */

import 'dotenv/config';
import { PerformanceBenchmark } from '../src/benchmarks/performance-metrics';

describe('Performance Benchmarks', () => {
  describe('PerformanceBenchmark', () => {
    it('should measure basic operation timing correctly', async () => {
      const operationDelay = 10; // 10ms delay
      const operations = 5;

      const metrics = await PerformanceBenchmark.runBenchmark(
        {
          name: 'Test Operation',
          operations,
          concurrency: 1,
          trackMemory: false,
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, operationDelay));
        },
      );

      expect(metrics.totalTime).toBeGreaterThan(0);
      expect(metrics.throughput).toBeGreaterThan(0);
      expect(metrics.avgLatency).toBeGreaterThan(0);
      expect(metrics.errors.count).toBe(0);
      expect(metrics.errors.rate).toBe(0);
    }, 10000);

    it('should handle concurrent operations correctly', async () => {
      const operationDelay = 20;
      const concurrency = 3;
      const operations = 6;

      const metrics = await PerformanceBenchmark.runBenchmark(
        {
          name: 'Concurrent Test',
          operations,
          concurrency,
          trackMemory: false,
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, operationDelay));
        },
      );

      expect(metrics.totalTime).toBeGreaterThan(0);
      expect(metrics.throughput).toBeGreaterThan(0);
      expect(metrics.errors.count).toBe(0);
    }, 10000);

    it('should track errors correctly', async () => {
      let operationCount = 0;

      const metrics = await PerformanceBenchmark.runBenchmark(
        {
          name: 'Error Test',
          operations: 10,
          concurrency: 1,
          trackMemory: false,
        },
        async () => {
          operationCount++;
          if (operationCount <= 4) {
            // First 4 operations fail
            throw new Error('Test error');
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
      );

      expect(metrics.errors.count).toBe(4);
      expect(metrics.errors.rate).toBe(40);
      expect(metrics.throughput).toBeGreaterThan(0); // Should have 6 successful operations
    }, 10000);

    it('should calculate percentiles correctly', async () => {
      // Create operations with predictable latencies
      let operationCount = 0;
      const latencies = [5, 5, 10, 10, 15, 15, 20, 20, 25, 30]; // 10 operations with known latencies

      const metrics = await PerformanceBenchmark.runBenchmark(
        {
          name: 'Percentile Test',
          operations: 10,
          concurrency: 1,
          trackMemory: false,
        },
        async () => {
          const delay = latencies[operationCount % latencies.length];
          operationCount++;
          await new Promise((resolve) => setTimeout(resolve, delay));
        },
      );

      expect(metrics.medianLatency).toBeGreaterThan(0);
      expect(metrics.p95Latency).toBeGreaterThanOrEqual(metrics.medianLatency);
      expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p95Latency);
      expect(metrics.latencyStdDev).toBeGreaterThan(0);
    }, 15000);

    it('should track memory usage when enabled', async () => {
      const metrics = await PerformanceBenchmark.runBenchmark(
        {
          name: 'Memory Test',
          operations: 5,
          concurrency: 1,
          trackMemory: true,
        },
        async () => {
          // Create some objects to use memory
          const data = new Array(1000).fill(0).map(() => ({ value: Math.random() }));
          await new Promise((resolve) => setTimeout(resolve, 10));
          return data.length; // Use the data so it's not optimized away
        },
      );

      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.startMB).toBeGreaterThan(0);
      expect(metrics.memory.endMB).toBeGreaterThan(0);
      expect(metrics.memory.peakUsageMB).toBeGreaterThanOrEqual(metrics.memory.startMB);
    });

    it('should include system information', async () => {
      const metrics = await PerformanceBenchmark.runBenchmark(
        {
          name: 'System Info Test',
          operations: 1,
          concurrency: 1,
          trackMemory: false,
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );

      expect(metrics.system).toBeDefined();
      expect(metrics.system.cpuCores).toBeGreaterThan(0);
      expect(metrics.system.totalMemoryGB).toBeGreaterThan(0);
      expect(metrics.system.availableMemoryGB).toBeGreaterThan(0);
      expect(metrics.system.totalMemoryGB).toBeGreaterThan(metrics.system.availableMemoryGB);
    });
  });

  describe('PerformanceBenchmark.compareMetrics', () => {
    it('should not throw when comparing metrics', () => {
      const baselineMetrics = {
        totalTime: 1000,
        throughput: 100,
        avgLatency: 10,
        medianLatency: 9,
        p95Latency: 15,
        p99Latency: 20,
        latencyStdDev: 3,
        memory: { peakUsageMB: 50, deltaMB: 5, startMB: 45, endMB: 50 },
        system: { cpuCores: 4, totalMemoryGB: 16, availableMemoryGB: 8 },
        errors: { count: 0, rate: 0 },
      };

      const candidateMetrics = {
        ...baselineMetrics,
        throughput: 120,
        avgLatency: 8,
      };

      // Should not throw
      expect(() => {
        PerformanceBenchmark.compareMetrics(baselineMetrics, candidateMetrics);
      }).not.toThrow();
    });
  });
});

// Only run integration tests if DATABASE_URL is available
const describeif = process.env.DATABASE_URL ? describe : describe.skip;

describeif('Performance Benchmarks Integration', () => {
  describe('Database Performance', () => {
    it('should be able to run a basic database benchmark', async () => {
      const { PgParallel } = await import('../src/pg-parallel');

      const db = new PgParallel({
        connectionString: process.env.DATABASE_URL!,
        max: 5,
        maxWorkers: 1,
      });

      try {
        const metrics = await PerformanceBenchmark.runBenchmark(
          {
            name: 'Database Integration Test',
            operations: 5,
            concurrency: 1,
            trackMemory: false,
          },
          async () => {
            await db.query('SELECT 1 as test_value');
          },
        );

        expect(metrics.throughput).toBeGreaterThan(0);
        expect(metrics.errors.rate).toBe(0);
        expect(metrics.totalTime).toBeGreaterThan(0);
        expect(metrics.system.cpuCores).toBeGreaterThan(0);
      } finally {
        await db.shutdown();
      }
    }, 30000); // 30 second timeout for integration test
  });
});
