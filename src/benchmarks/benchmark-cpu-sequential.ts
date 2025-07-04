const TOTAL_REQUESTS_CPU = 8;
const CPU_COMPLEXITY = 42;

/**
 * Calculates Fibonacci number recursively for CPU-intensive benchmarking
 * @param n The Fibonacci number to calculate
 * @returns The calculated Fibonacci value
 */
const fibonacciTask = function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

/**
 * Runs CPU-intensive benchmark sequentially for baseline comparison
 */
const runSequential = () => {
  const startTime = Date.now();
  for (let i = 0; i < TOTAL_REQUESTS_CPU; i++) {
    fibonacciTask(CPU_COMPLEXITY);
  }
  console.log(`Sequential (baseline): ${(Date.now() - startTime) / 1000}s`);
};

runSequential();
