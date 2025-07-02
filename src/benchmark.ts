/**
 * @file Main benchmark entry point to test all three use cases of the intelligent hybrid API.
 * This file provides a fair, direct comparison for each scenario.
 */

import { execSync } from 'child_process';
import { cpus, totalmem } from 'os';

const runBenchmark = (name: string, command: string) => {
  try {
    console.log(`\nRunning ${name}...`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Benchmark ${name} failed:`, error);
    process.exit(1);
  }
};

const runAll = () => {
  const cpuModel = cpus()[0].model;
  const totalMemoryGB = (totalmem() / 1024 ** 3).toFixed(2);

  console.log('==========================================================');
  console.log('Starting Benchmarks');
  console.log(`CPU: ${cpuModel} (${cpus().length} cores)`);
  console.log(`Memory: ${totalMemoryGB} GB`);
  console.log('==========================================================');

  runBenchmark('Pure I/O Benchmark', 'ts-node src/benchmark-io.ts');
  runBenchmark('Pure CPU Benchmark (Parallel)', 'ts-node src/benchmark-cpu-parallel.ts');
  runBenchmark('Pure CPU Benchmark (Sequential)', 'ts-node src/benchmark-cpu-sequential.ts');
  runBenchmark('Mixed I/O + CPU Benchmark (Parallel)', 'ts-node src/benchmark-mixed-parallel.ts');
  runBenchmark('Mixed I/O + CPU Benchmark (Sequential)', 'ts-node src/benchmark-mixed-sequential.ts');

  console.log('\nAll benchmarks completed successfully.');
};

runAll();
