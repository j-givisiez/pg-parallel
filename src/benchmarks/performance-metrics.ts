/**
 * @file Performance metrics utilities for comprehensive benchmarking
 */

import { cpus, totalmem, freemem } from 'os';
import { performance } from 'perf_hooks';

export interface PerformanceMetrics {
  /** Total execution time in milliseconds */
  totalTime: number;
  /** Operations per second */
  throughput: number;
  /** Average latency per operation in milliseconds */
  avgLatency: number;
  /** Median latency in milliseconds */
  medianLatency: number;
  /** 95th percentile latency in milliseconds */
  p95Latency: number;
  /** 99th percentile latency in milliseconds */
  p99Latency: number;
  /** Standard deviation of latencies */
  latencyStdDev: number;
  /** Memory usage statistics */
  memory: {
    /** Peak memory usage in MB */
    peakUsageMB: number;
    /** Memory usage delta in MB */
    deltaMB: number;
    /** Memory usage at start in MB */
    startMB: number;
    /** Memory usage at end in MB */
    endMB: number;
  };
  /** System information */
  system: {
    /** Number of CPU cores */
    cpuCores: number;
    /** Total system memory in GB */
    totalMemoryGB: number;
    /** Available memory at start in GB */
    availableMemoryGB: number;
  };
  /** Error statistics */
  errors: {
    /** Total number of errors */
    count: number;
    /** Error rate as percentage */
    rate: number;
  };
}

export interface BenchmarkOptions {
  /** Name of the benchmark */
  name: string;
  /** Number of operations to run */
  operations: number;
  /** Number of concurrent operations */
  concurrency?: number;
  /** Warmup operations before measurement */
  warmupOps?: number;
  /** Enable detailed memory tracking */
  trackMemory?: boolean;
}

export class PerformanceBenchmark {
  private startTime: number = 0;
  private endTime: number = 0;
  private latencies: number[] = [];
  private errors: number = 0;
  private memoryStart: number = 0;
  private memoryEnd: number = 0;
  private peakMemory: number = 0;
  private memoryInterval?: NodeJS.Timeout;

  /**
   * Starts the benchmark measurement
   * @param trackMemory Whether to track memory usage continuously
   */
  start(trackMemory: boolean = false): void {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    this.memoryStart = process.memoryUsage().heapUsed / 1024 / 1024;
    this.peakMemory = this.memoryStart;
    this.startTime = performance.now();
    this.latencies = [];
    this.errors = 0;

    if (trackMemory) {
      this.memoryInterval = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        this.peakMemory = Math.max(this.peakMemory, currentMemory);
      }, 100);
    }
  }

  /**
   * Records the completion of an individual operation
   * @param startTime Start time of the operation
   * @param isError Whether the operation resulted in an error
   * @param endTime Optional end time (if not provided, uses current time)
   */
  recordOperation(startTime: number, isError: boolean = false, endTime?: number): void {
    const latency = (endTime || performance.now()) - startTime;
    this.latencies.push(latency);

    if (isError) {
      this.errors++;
    }
  }

  /**
   * Stops the benchmark and calculates final metrics
   * @param totalOperations Total number of operations attempted
   * @returns Complete performance metrics
   */
  stop(totalOperations: number): PerformanceMetrics {
    this.endTime = performance.now();
    this.memoryEnd = process.memoryUsage().heapUsed / 1024 / 1024;

    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }

    return this.calculateMetrics(totalOperations);
  }

  /**
   * Calculates comprehensive performance metrics
   * @param totalOperations Total number of operations
   * @returns Calculated metrics
   */
  private calculateMetrics(totalOperations: number): PerformanceMetrics {
    const totalTime = this.endTime - this.startTime;
    const successfulOps = this.latencies.length;

    // Sort latencies for percentile calculations
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);

    // Calculate percentiles with proper boundary handling
    const p95Index = Math.max(0, Math.min(sortedLatencies.length - 1, Math.floor(sortedLatencies.length * 0.95)));
    const p99Index = Math.max(0, Math.min(sortedLatencies.length - 1, Math.floor(sortedLatencies.length * 0.99)));
    const medianIndex = Math.max(0, Math.min(sortedLatencies.length - 1, Math.floor(sortedLatencies.length * 0.5)));

    // Calculate average and standard deviation
    const avgLatency =
      sortedLatencies.length > 0 ? sortedLatencies.reduce((sum, lat) => sum + lat, 0) / sortedLatencies.length : 0;

    const variance =
      sortedLatencies.length > 1
        ? sortedLatencies.reduce((sum, lat) => sum + Math.pow(lat - avgLatency, 2), 0) / (sortedLatencies.length - 1)
        : 0;

    const latencyStdDev = Math.sqrt(variance);

    return {
      totalTime,
      throughput: totalTime > 0 ? successfulOps / (totalTime / 1000) : 0,
      avgLatency,
      medianLatency: sortedLatencies[medianIndex] || 0,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      latencyStdDev,
      memory: {
        peakUsageMB: this.peakMemory,
        deltaMB: this.memoryEnd - this.memoryStart,
        startMB: this.memoryStart,
        endMB: this.memoryEnd,
      },
      system: {
        cpuCores: cpus().length,
        totalMemoryGB: parseFloat((totalmem() / 1024 ** 3).toFixed(2)),
        availableMemoryGB: parseFloat((freemem() / 1024 ** 3).toFixed(2)),
      },
      errors: {
        count: this.errors,
        rate: totalOperations > 0 ? (this.errors / totalOperations) * 100 : 0,
      },
    };
  }

  /**
   * Runs a benchmark with specified options
   * @param options Benchmark configuration
   * @param operationFn Function to execute for each operation
   * @returns Performance metrics
   */
  static async runBenchmark<T>(options: BenchmarkOptions, operationFn: () => Promise<T>): Promise<PerformanceMetrics> {
    const benchmark = new PerformanceBenchmark();

    console.log(`\n=== ${options.name} ===`);
    console.log(`Operations: ${options.operations}`);
    console.log(`Concurrency: ${options.concurrency || 1}`);

    // Warmup phase (excluded from measurement)
    if (options.warmupOps && options.warmupOps > 0) {
      console.log(`Warming up (${options.warmupOps} operations)...`);

      // Warmup with controlled concurrency to avoid overwhelming
      const warmupConcurrency = Math.min(options.warmupOps, 10);
      const warmupBatches = Math.ceil(options.warmupOps / warmupConcurrency);

      for (let batch = 0; batch < warmupBatches; batch++) {
        const batchSize = Math.min(warmupConcurrency, options.warmupOps - batch * warmupConcurrency);
        const warmupPromises = Array.from(
          { length: batchSize },
          () => operationFn().catch(() => {}), // Ignore warmup errors
        );
        await Promise.all(warmupPromises);
      }
    }

    // Small pause after warmup to stabilize
    if (options.warmupOps && options.warmupOps > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Main benchmark (measurement starts here)
    console.log('Starting benchmark...');
    benchmark.start(options.trackMemory);

    const concurrency = options.concurrency || 1;
    const operationsPerBatch = Math.ceil(options.operations / concurrency);

    const batchPromises = Array.from({ length: concurrency }, async (_, batchIndex) => {
      const startOp = batchIndex * operationsPerBatch;
      const endOp = Math.min(startOp + operationsPerBatch, options.operations);

      for (let i = startOp; i < endOp; i++) {
        const opStart = performance.now();
        try {
          await operationFn();
          const opEnd = performance.now();
          benchmark.recordOperation(opStart, false, opEnd);
        } catch (error) {
          const opEnd = performance.now();
          benchmark.recordOperation(opStart, true, opEnd);
        }
      }
    });

    await Promise.all(batchPromises);

    const metrics = benchmark.stop(options.operations);

    // Display results
    console.log(`Completed in ${(metrics.totalTime / 1000).toFixed(2)}s`);
    console.log(`Throughput: ${metrics.throughput.toFixed(2)} ops/sec`);
    console.log(`Avg Latency: ${metrics.avgLatency.toFixed(2)}ms`);
    console.log(`P95 Latency: ${metrics.p95Latency.toFixed(2)}ms`);
    console.log(`Memory Delta: ${metrics.memory.deltaMB > 0 ? '+' : ''}${metrics.memory.deltaMB.toFixed(2)}MB`);
    if (metrics.errors.count > 0) {
      console.log(`Errors: ${metrics.errors.count} (${metrics.errors.rate.toFixed(2)}%)`);
    }

    return metrics;
  }

  /**
   * Compares two sets of metrics and displays the comparison
   * @param baseline Baseline metrics
   * @param candidate Candidate metrics
   * @param baselineName Name of the baseline
   * @param candidateName Name of the candidate
   */
  static compareMetrics(
    baseline: PerformanceMetrics,
    candidate: PerformanceMetrics,
    baselineName: string = 'Baseline',
    candidateName: string = 'Candidate',
  ): void {
    console.log(`\nPerformance Comparison: ${candidateName} vs ${baselineName}`);
    console.log('='.repeat(60));

    const throughputDiff = ((candidate.throughput - baseline.throughput) / baseline.throughput) * 100;
    const latencyDiff = ((candidate.avgLatency - baseline.avgLatency) / baseline.avgLatency) * 100;
    const memoryDiff = candidate.memory.deltaMB - baseline.memory.deltaMB;

    console.log(
      `Throughput: ${candidate.throughput.toFixed(2)} vs ${baseline.throughput.toFixed(2)} ops/sec (${throughputDiff > 0 ? '+' : ''}${throughputDiff.toFixed(1)}%)`,
    );
    console.log(
      `Avg Latency: ${candidate.avgLatency.toFixed(2)} vs ${baseline.avgLatency.toFixed(2)}ms (${latencyDiff > 0 ? '+' : ''}${latencyDiff.toFixed(1)}%)`,
    );
    console.log(
      `Memory Delta: ${candidate.memory.deltaMB.toFixed(2)} vs ${baseline.memory.deltaMB.toFixed(2)}MB (${memoryDiff > 0 ? '+' : ''}${memoryDiff.toFixed(2)}MB diff)`,
    );

    if (throughputDiff > 5) {
      console.log(`${candidateName} is significantly faster!`);
    } else if (throughputDiff < -5) {
      console.log(`${candidateName} is significantly slower.`);
    } else {
      console.log(`Performance is comparable.`);
    }
  }
}
