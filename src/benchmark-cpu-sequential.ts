const TOTAL_REQUESTS_CPU = 8;
const CPU_COMPLEXITY = 42;

const fibonacciTask = function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

const runSequential = () => {
  const startTime = Date.now();
  for (let i = 0; i < TOTAL_REQUESTS_CPU; i++) {
    fibonacciTask(CPU_COMPLEXITY);
  }
  console.log(`Sequential (baseline): ${(Date.now() - startTime) / 1000}s`);
};

runSequential();
