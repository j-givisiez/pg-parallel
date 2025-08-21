# Performance Testing Guide

This guide provides comprehensive information about performance testing
capabilities in pg-parallel, including benchmarks, load tests, and monitoring
recommendations.

## Overview

pg-parallel includes a sophisticated performance testing suite designed to
validate stability, performance, and resilience under various conditions. The
testing framework provides detailed metrics, automated analysis, and production
readiness assessment.

## Available Test Suites

### 1. Enhanced I/O Benchmarks

**Purpose**: Comprehensive I/O performance testing with detailed metrics

```bash
# Run enhanced I/O benchmarks
npm run benchmark:enhanced
```

**Features**:

- Light, medium, and heavy load scenarios
- Connection pool stress testing
- Query complexity benchmarking
- Detailed latency percentiles (P95, P99)
- Memory usage tracking
- Throughput analysis

**Output Metrics**:

- Operations per second (throughput)
- Average, median, P95, P99 latency
- Memory usage (peak, delta, start/end)
- Error rates and categorization
- System resource utilization

### 2. Load and Stress Testing

**Purpose**: Validate system behavior under high load and resource constraints

```bash
# Run all load tests
npm run benchmark:load

# Run specific test types
npm run benchmark:load concurrency    # High concurrency testing
npm run benchmark:memory              # Memory leak detection
npm run benchmark:load exhaustion     # Resource exhaustion testing
npm run benchmark:stability 10        # 10-minute stability test
```

**Test Scenarios**:

#### High Concurrency Test

- Tests 50, 100, 200, 500 concurrent operations
- Mixed I/O and CPU workloads
- Performance degradation analysis
- Latency impact assessment

#### Memory Leak Detection

- 10 iterations of 500 operations each
- Forced garbage collection between iterations
- Memory growth trend analysis
- Leak detection with configurable thresholds

#### Resource Exhaustion Test

- Connection pool exhaustion scenarios
- Worker thread exhaustion testing
- Resilience under resource constraints
- Error handling validation

#### Stability Test

- Long-running continuous load (configurable duration)
- Memory usage monitoring over time
- Error rate tracking
- Performance consistency analysis

### 3. Resilience Testing

**Purpose**: Validate fault tolerance and recovery mechanisms

```bash
# Run all resilience tests
npm run benchmark:resilience

# Run specific resilience tests
npm run benchmark:resilience circuit-breaker
npm run benchmark:resilience retry
npm run benchmark:resilience error-categorization
npm run benchmark:resilience network
```

**Test Scenarios**:

#### Circuit Breaker Testing

- Failure injection to trigger circuit breaker
- Blocking behavior validation
- Recovery timing verification
- Latency reduction during failures

#### Retry Mechanism Testing

- Transient error simulation
- Exponential backoff validation
- Success rate improvement measurement
- Retry configuration effectiveness

#### Error Categorization Testing

- Syntax error detection
- Constraint violation handling
- Connection error classification
- Unknown error fallback behavior

#### Network Instability Simulation

- Simulated network timeouts (10% failure rate)
- Connection recovery testing
- Performance under unstable conditions
- Resilience metric analysis

### 4. Comprehensive Benchmark Suite

**Purpose**: Complete system validation with automated scoring and reporting

```bash
# Run full comprehensive benchmark
npm run benchmark:comprehensive
```

**Features**:

- Executes all test categories
- Automated performance scoring (0-100)
- System information collection
- Detailed recommendations
- JSON and Markdown report generation
- Production readiness assessment

**Generated Reports**:

- `benchmark-results-[timestamp].json`: Raw data and metrics
- `benchmark-report-[timestamp].md`: Human-readable analysis

## Performance Metrics Explained

### Throughput Metrics

- **Operations per second**: Rate of completed operations
- **Concurrency efficiency**: Performance scaling with parallel operations

### Latency Metrics

- **Average Latency**: Mean response time
- **Median Latency (P50)**: 50th percentile response time
- **P95 Latency**: 95th percentile response time (key SLA metric)
- **P99 Latency**: 99th percentile response time (worst-case analysis)
- **Standard Deviation**: Latency consistency measure

### Memory Metrics

- **Peak Usage**: Maximum memory consumption during test
- **Memory Delta**: Memory growth/shrinkage during test
- **Start/End Memory**: Memory usage at test boundaries

### Error Metrics

- **Error Count**: Total failed operations
- **Error Rate**: Percentage of failed operations
- **Error Categories**: Classification of error types

### System Metrics

- **CPU Cores**: Available processing units
- **Total Memory**: System memory capacity
- **Available Memory**: Free memory at test start

## Interpreting Results

### Performance Ratings

| Score  | Rating               | Description                               |
| ------ | -------------------- | ----------------------------------------- |
| 90-100 | 🏆 Excellent         | Production ready with optimal performance |
| 80-89  | 🥇 Good              | Production ready with good performance    |
| 70-79  | 🥈 Acceptable        | Production ready with monitoring          |
| 60-69  | 🥉 Needs Improvement | Review configuration before production    |
| 0-59   | ⚠️ Poor              | Address issues before production use      |

### Key Performance Indicators

#### I/O Performance

- **Acceptable**: >1000 ops/sec for simple queries
- **Good**: P95 latency <100ms
- **Excellent**: Consistent performance across load levels

#### Load Handling

- **Acceptable**: <5% error rate under high concurrency
- **Good**: Linear throughput scaling up to system limits
- **Excellent**: Graceful degradation beyond capacity

#### Memory Stability

- **Acceptable**: <50MB total growth in leak detection test
- **Good**: <2MB average growth per iteration
- **Excellent**: Stable memory usage over time

#### Resilience

- **Acceptable**: Circuit breaker opens within threshold
- **Good**: <1s recovery time after cooldown
- **Excellent**: <1% error rate with retry mechanisms

## Production Recommendations

### Baseline Testing

1. Run comprehensive benchmark before production deployment
2. Establish performance baselines for monitoring
3. Document acceptable performance ranges
4. Set up alerting thresholds based on benchmark results

### Load Testing Strategy

1. Test with production-like data volumes
2. Simulate realistic traffic patterns
3. Include peak load scenarios (2-3x normal traffic)
4. Test failover and recovery scenarios

### Monitoring Setup

1. Monitor key metrics identified in benchmarks
2. Set up circuit breaker and retry monitoring
3. Track memory usage trends
4. Monitor connection pool utilization

### Configuration Tuning

#### Based on System Resources

```javascript
// High-performance server (8+ cores, 16+ GB RAM)
const config = {
  max: 100,
  maxWorkers: Math.min(cpus().length, 8),
  idleTimeoutMillis: 30000,
};

// Medium server (4-8 cores, 8-16 GB RAM)
const config = {
  max: 50,
  maxWorkers: Math.min(cpus().length, 4),
  idleTimeoutMillis: 20000,
};

// Small server (2-4 cores, 4-8 GB RAM)
const config = {
  max: 20,
  maxWorkers: Math.min(cpus().length, 2),
  idleTimeoutMillis: 10000,
};
```

#### Circuit Breaker Tuning

```javascript
// Conservative (fail-safe)
circuitBreaker: {
  failureThreshold: 3,
  cooldownMs: 10000,
  halfOpenMaxCalls: 1,
  halfOpenSuccessesToClose: 2,
}

// Balanced (recommended)
circuitBreaker: {
  failureThreshold: 5,
  cooldownMs: 5000,
  halfOpenMaxCalls: 2,
  halfOpenSuccessesToClose: 2,
}

// Aggressive (high-performance)
circuitBreaker: {
  failureThreshold: 10,
  cooldownMs: 2000,
  halfOpenMaxCalls: 3,
  halfOpenSuccessesToClose: 1,
}
```

#### Retry Configuration

```javascript
// Conservative
retry: {
  maxAttempts: 2,
  initialDelayMs: 200,
  maxDelayMs: 2000,
  backoffFactor: 2,
  jitter: true,
}

// Balanced (recommended)
retry: {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffFactor: 2,
  jitter: true,
}

// Aggressive
retry: {
  maxAttempts: 5,
  initialDelayMs: 50,
  maxDelayMs: 500,
  backoffFactor: 1.5,
  jitter: true,
}
```

## Custom Performance Testing

### Creating Custom Benchmarks

```typescript
import { PerformanceBenchmark } from './src/benchmarks/performance-metrics';

const customBenchmark = async () => {
  const metrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Custom Database Operation',
      operations: 1000,
      concurrency: 20,
      warmupOps: 50,
      trackMemory: true,
    },
    async () => {
      // Your custom operation here
      await db.query('SELECT * FROM your_table WHERE condition = ?', [value]);
    },
  );

  console.log(`Throughput: ${metrics.throughput.toFixed(2)} ops/sec`);
  console.log(`P95 Latency: ${metrics.p95Latency.toFixed(2)}ms`);
};
```

### Performance Monitoring Integration

```typescript
import { PerformanceBenchmark } from 'pg-parallel';

// Regular performance health check
const performanceHealthCheck = async () => {
  const healthMetrics = await PerformanceBenchmark.runBenchmark(
    {
      name: 'Health Check',
      operations: 100,
      concurrency: 10,
      trackMemory: false,
    },
    async () => {
      await db.query('SELECT 1');
    },
  );

  // Alert if performance degrades
  if (healthMetrics.p95Latency > ACCEPTABLE_LATENCY_MS) {
    alerting.send('High database latency detected');
  }

  if (healthMetrics.errors.rate > ACCEPTABLE_ERROR_RATE) {
    alerting.send('High database error rate detected');
  }
};

// Run health check every 5 minutes
setInterval(performanceHealthCheck, 5 * 60 * 1000);
```

## Troubleshooting Performance Issues

### High Latency

1. Check connection pool size vs. concurrency
2. Verify database server performance
3. Review query complexity and indexing
4. Monitor network latency to database

### High Error Rates

1. Review circuit breaker configuration
2. Check retry mechanism settings
3. Verify database connection stability
4. Monitor resource exhaustion indicators

### Memory Growth

1. Run memory leak detection test
2. Check for connection leaks
3. Review worker thread lifecycle
4. Monitor garbage collection patterns

### Poor Throughput

1. Increase connection pool size
2. Optimize query performance
3. Review worker thread allocation
4. Check system resource utilization

## Continuous Integration

### Automated Performance Testing

```yaml
# .github/workflows/performance.yml
name: Performance Testing
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run build

      # Run lightweight performance tests in CI
      - name: Performance Tests
        run: |
          npm run benchmark:enhanced
          npm run benchmark:memory
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres

      - name: Archive Performance Results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: benchmark-*.json
```

## Best Practices

### Testing Environment

1. Use dedicated test database
2. Ensure consistent system resources
3. Run tests multiple times for consistency
4. Document environmental factors

### Test Data Management

1. Use realistic data volumes
2. Include data distribution patterns
3. Test with both fresh and aged data
4. Consider data growth over time

### Performance Regression Detection

1. Store historical benchmark results
2. Compare against previous baselines
3. Set regression thresholds (e.g., 10% degradation)
4. Automated alerts for significant changes

### Production Validation

1. Regular performance health checks
2. Canary deployments with performance monitoring
3. Load testing in staging environment
4. Gradual traffic increase with monitoring

---

For more information, see the [main documentation](../README.md) and
[examples](../examples/README.md).
