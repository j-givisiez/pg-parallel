/**
 * @file Benchmark entry point to run the 10-run variants for I/O, CPU, and Mixed scenarios.
 */

import { execSync } from 'child_process';
import { cpus, totalmem } from 'os';

/**
 * Runs a single benchmark command and handles errors
 * @param name The name of the benchmark for logging
 * @param command The command to execute
 */
const runBenchmark = (name: string, command: string) => {
  try {
    console.log(`\nRunning ${name}...`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Benchmark ${name} failed:`, error);
    process.exit(1);
  }
};

/**
 * Runs all 10-run benchmarks in sequence and displays system information
 */
const runAll = () => {
  const cpuModel = cpus()[0].model;
  const totalMemoryGB = (totalmem() / 1024 ** 3).toFixed(2);

  console.log('==========================================================');
  console.log('Starting Benchmarks (10 runs each)');
  console.log(`CPU: ${cpuModel} (${cpus().length} cores)`);
  console.log(`Memory: ${totalMemoryGB} GB`);
  console.log('==========================================================');

  runBenchmark('Pure I/O Benchmark - 10 runs', 'ts-node src/benchmarks/benchmark-io-10-runs.ts');
  runBenchmark('Pure CPU Benchmark - 10 runs', 'ts-node src/benchmarks/benchmark-cpu-10-runs.ts');
  runBenchmark('Mixed I/O + CPU Benchmark - 10 runs', 'ts-node src/benchmarks/benchmark-mixed-10-runs.ts');

  console.log('\nAll 10-run benchmarks completed successfully');
};

runAll();
