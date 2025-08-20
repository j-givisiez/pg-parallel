import 'dotenv/config';
import { PgParallel, ErrorUtils, RetryUtils, CircuitBreakerUtils, CircuitBreakerState, RetryConfig } from '../src';

/**
 * Demonstrates how to use the extracted utilities for custom error handling,
 * retry logic, and circuit breaker patterns.
 */
async function main() {
  console.log('Running Example 7: Utilities Usage');

  // Demonstrate ErrorUtils
  console.log('\n=== Error Utilities Demo ===');

  // Create sample errors
  const timeoutError = { code: 'ETIMEDOUT', message: 'Connection timeout' };
  const connectionError = { code: 'ECONNREFUSED', message: 'Connection refused' };
  const unknownError = { message: 'Some random error' };

  console.log('Timeout error category:', ErrorUtils.categorizeError(timeoutError));
  console.log('Connection error category:', ErrorUtils.categorizeError(connectionError));
  console.log('Unknown error category:', ErrorUtils.categorizeError(unknownError));
  console.log('Is timeout transient?', ErrorUtils.isTransient(timeoutError));
  console.log('Is connection transient?', ErrorUtils.isTransient(connectionError));

  // Demonstrate RetryUtils
  console.log('\n=== Retry Utilities Demo ===');

  const retryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 500,
    backoffFactor: 2,
    jitter: true,
  };

  let attempt = 0;
  const flakyOperation = async () => {
    attempt++;
    console.log(`  Attempt ${attempt}`);
    if (attempt < 3) {
      throw timeoutError; // Will be retried as it's transient
    }
    return 'Success after retries!';
  };

  try {
    const result = await RetryUtils.executeWithRetry(flakyOperation, retryConfig, 'demo-operation');
    console.log('Retry result:', result);
  } catch (error) {
    console.log('Retry failed after all attempts');
  }

  // Demonstrate CircuitBreakerUtils
  console.log('\n=== Circuit Breaker Utilities Demo ===');

  const breakerConfig = CircuitBreakerUtils.getDefaultConfig();
  const breakerState: CircuitBreakerState = CircuitBreakerUtils.createInitialState();

  console.log('Initial breaker state:', breakerState.state);
  console.log('Default config:', breakerConfig);

  // Simulate failures to open circuit breaker
  for (let i = 0; i < 6; i++) {
    CircuitBreakerUtils.onBreakerFailure(breakerState, breakerConfig);
    console.log(
      `After failure ${i + 1}, state: ${breakerState.state}, consecutive failures: ${breakerState.consecutiveFailures}`,
    );
  }

  // Try to ensure state (should remain OPEN due to cooldown)
  try {
    await CircuitBreakerUtils.ensureBreakerState(breakerState, breakerConfig);
  } catch (error) {
    console.log('Circuit breaker is open, operation blocked');
  }

  // Test success recovery
  CircuitBreakerUtils.onBreakerSuccess(breakerState, breakerConfig);
  console.log('After success, state:', breakerState.state);

  console.log('\n=== Integration with PgParallel ===');

  if (process.env.DATABASE_URL) {
    const db = new PgParallel({
      connectionString: process.env.DATABASE_URL,
      maxWorkers: 1,
      retry: retryConfig,
      circuitBreaker: breakerConfig,
      logger: {
        info: (msg, meta) => console.log('INFO:', msg, meta),
        warn: (msg, meta) => console.log('WARN:', msg, meta),
        error: (msg, meta) => console.log('ERROR:', msg, meta),
      },
    });

    console.log('PgParallel instance created with custom retry and circuit breaker configs');
    await db.shutdown();
  } else {
    console.log('DATABASE_URL not set, skipping PgParallel integration demo');
  }

  console.log('\nUtilities demo completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
