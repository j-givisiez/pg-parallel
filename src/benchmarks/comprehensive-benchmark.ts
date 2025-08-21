/**
 * @file Comprehensive benchmark suite runner with detailed reporting
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { cpus, totalmem, platform, arch } from 'os';
import { runEnhancedIOBenchmark } from './enhanced-io-benchmark';
import { runHighConcurrencyTest, runMemoryLeakTest, runStabilityTest } from './load-stress-test';
import { runCircuitBreakerTest, runRetryMechanismTest } from './resilience-benchmark';

/**
 * System information interface
 */
interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  timestamp: string;
}

/**
 * Benchmark suite results
 */
interface BenchmarkSuiteResults {
  systemInfo: SystemInfo;
  executionTimeMs: number;
  testResults: {
    ioPerformance: boolean;
    loadStress: boolean;
    resilience: boolean;
    stability: boolean;
  };
  recommendations: string[];
  overallScore: number;
}

/**
 * Collects system information for the benchmark report
 */
const collectSystemInfo = (): SystemInfo => {
  const cpu = cpus()[0];
  return {
    platform: platform(),
    arch: arch(),
    nodeVersion: process.version,
    cpuModel: cpu.model,
    cpuCores: cpus().length,
    totalMemoryGB: parseFloat((totalmem() / 1024 ** 3).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
};

/**
 * Runs I/O performance benchmarks
 */
const runIOPerformanceTests = async (): Promise<boolean> => {
  console.log('\n🚀 === I/O PERFORMANCE TESTS ===');
  try {
    await runEnhancedIOBenchmark();
    console.log('✅ I/O performance tests completed successfully');
    return true;
  } catch (error) {
    console.error('❌ I/O performance tests failed:', error);
    return false;
  }
};

/**
 * Runs load and stress tests
 */
const runLoadStressTests = async (): Promise<boolean> => {
  console.log('\n💪 === LOAD & STRESS TESTS ===');
  try {
    await runHighConcurrencyTest();
    await runMemoryLeakTest();
    console.log('✅ Load & stress tests completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Load & stress tests failed:', error);
    return false;
  }
};

/**
 * Runs resilience and fault tolerance tests
 */
const runResilienceTests = async (): Promise<boolean> => {
  console.log('\n🛡️  === RESILIENCE TESTS ===');
  try {
    await runCircuitBreakerTest();
    await runRetryMechanismTest();
    console.log('✅ Resilience tests completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Resilience tests failed:', error);
    return false;
  }
};

/**
 * Runs stability test (shorter duration for comprehensive suite)
 */
const runStabilityTests = async (): Promise<boolean> => {
  console.log('\n⏰ === STABILITY TESTS ===');
  try {
    await runStabilityTest(2); // 2 minutes for comprehensive suite
    console.log('✅ Stability tests completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Stability tests failed:', error);
    return false;
  }
};

/**
 * Generates recommendations based on test results
 */
const generateRecommendations = (
  results: Omit<BenchmarkSuiteResults, 'recommendations' | 'overallScore'>,
): string[] => {
  const recommendations: string[] = [];
  const system = results.systemInfo;

  // System-based recommendations
  if (system.cpuCores < 4) {
    recommendations.push(
      'Consider increasing maxWorkers setting for better CPU task performance on multi-core systems',
    );
  }

  if (system.totalMemoryGB < 8) {
    recommendations.push(
      'Monitor memory usage closely with lower system memory; consider reducing connection pool size',
    );
  }

  // Performance-based recommendations
  if (!results.testResults.ioPerformance) {
    recommendations.push('I/O performance issues detected - check database connection and network latency');
  }

  if (!results.testResults.loadStress) {
    recommendations.push('Load handling issues detected - consider tuning connection pool and worker settings');
  }

  if (!results.testResults.resilience) {
    recommendations.push('Resilience issues detected - review circuit breaker and retry configurations');
  }

  if (!results.testResults.stability) {
    recommendations.push('Stability issues detected - run memory leak detection and long-term monitoring');
  }

  // General recommendations
  recommendations.push('Regular performance monitoring is recommended in production environments');
  recommendations.push('Consider load testing with production-like data volumes');

  return recommendations;
};

/**
 * Calculates overall performance score
 */
const calculateOverallScore = (testResults: BenchmarkSuiteResults['testResults']): number => {
  const weights = {
    ioPerformance: 30,
    loadStress: 25,
    resilience: 25,
    stability: 20,
  };

  let score = 0;
  let totalWeight = 0;

  Object.entries(testResults).forEach(([test, passed]) => {
    const weight = weights[test as keyof typeof weights];
    if (passed) {
      score += weight;
    }
    totalWeight += weight;
  });

  return Math.round((score / totalWeight) * 100);
};

/**
 * Generates a comprehensive benchmark report
 */
const generateReport = (results: BenchmarkSuiteResults): string => {
  const report = `
# PG-Parallel Comprehensive Benchmark Report

## System Information
- **Platform**: ${results.systemInfo.platform} (${results.systemInfo.arch})
- **Node.js Version**: ${results.systemInfo.nodeVersion}
- **CPU**: ${results.systemInfo.cpuModel} (${results.systemInfo.cpuCores} cores)
- **Memory**: ${results.systemInfo.totalMemoryGB} GB
- **Timestamp**: ${results.systemInfo.timestamp}

## Test Results Summary
- **Execution Time**: ${(results.executionTimeMs / 1000).toFixed(2)} seconds
- **Overall Score**: ${results.overallScore}/100

### Individual Test Results
- **I/O Performance**: ${results.testResults.ioPerformance ? '✅ PASS' : '❌ FAIL'}
- **Load & Stress**: ${results.testResults.loadStress ? '✅ PASS' : '❌ FAIL'}
- **Resilience**: ${results.testResults.resilience ? '✅ PASS' : '❌ FAIL'}
- **Stability**: ${results.testResults.stability ? '✅ PASS' : '❌ FAIL'}

## Performance Rating
${
  results.overallScore >= 90
    ? '🏆 EXCELLENT - Production ready with optimal performance'
    : results.overallScore >= 80
      ? '🥇 GOOD - Production ready with good performance'
      : results.overallScore >= 70
        ? '🥈 ACCEPTABLE - Production ready with monitoring'
        : results.overallScore >= 60
          ? '🥉 NEEDS IMPROVEMENT - Review configuration before production'
          : '⚠️  POOR - Address issues before production use'
}

## Recommendations
${results.recommendations.map((rec) => `- ${rec}`).join('\n')}

## Next Steps
1. Review any failed test categories in detail
2. Implement recommended optimizations
3. Re-run specific test suites to validate improvements
4. Set up production monitoring based on benchmark baselines

---
Generated by pg-parallel comprehensive benchmark suite
`;

  return report.trim();
};

/**
 * Saves benchmark results to file
 */
const saveBenchmarkResults = (results: BenchmarkSuiteResults): void => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Save JSON results
  const jsonFilename = `benchmark-results-${timestamp}.json`;
  const jsonPath = join(process.cwd(), jsonFilename);
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // Save markdown report
  const reportFilename = `benchmark-report-${timestamp}.md`;
  const reportPath = join(process.cwd(), reportFilename);
  const report = generateReport(results);
  writeFileSync(reportPath, report);

  console.log(`\n📄 Results saved to:`);
  console.log(`   JSON: ${jsonFilename}`);
  console.log(`   Report: ${reportFilename}`);
};

/**
 * Main comprehensive benchmark runner
 */
const runComprehensiveBenchmark = async () => {
  console.log('🧪 PG-PARALLEL COMPREHENSIVE BENCHMARK SUITE');
  console.log('============================================');

  const systemInfo = collectSystemInfo();
  const startTime = Date.now();

  console.log('\n📋 System Information:');
  console.log(`   Platform: ${systemInfo.platform} (${systemInfo.arch})`);
  console.log(`   Node.js: ${systemInfo.nodeVersion}`);
  console.log(`   CPU: ${systemInfo.cpuModel} (${systemInfo.cpuCores} cores)`);
  console.log(`   Memory: ${systemInfo.totalMemoryGB} GB`);

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Run test suites
  const testResults = {
    ioPerformance: await runIOPerformanceTests(),
    loadStress: await runLoadStressTests(),
    resilience: await runResilienceTests(),
    stability: await runStabilityTests(),
  };

  const executionTimeMs = Date.now() - startTime;

  // Compile results
  const results: BenchmarkSuiteResults = {
    systemInfo,
    executionTimeMs,
    testResults,
    recommendations: [],
    overallScore: 0,
  };

  results.recommendations = generateRecommendations(results);
  results.overallScore = calculateOverallScore(testResults);

  // Display summary
  console.log('\n🏁 BENCHMARK SUITE COMPLETED');
  console.log('============================');
  console.log(`⏱️  Total execution time: ${(executionTimeMs / 1000).toFixed(2)} seconds`);
  console.log(`📊 Overall score: ${results.overallScore}/100`);

  const passedTests = Object.values(testResults).filter(Boolean).length;
  const totalTests = Object.values(testResults).length;
  console.log(`✅ Tests passed: ${passedTests}/${totalTests}`);

  if (results.overallScore >= 80) {
    console.log('🎉 Excellent performance! pg-parallel is ready for production.');
  } else if (results.overallScore >= 60) {
    console.log('⚠️  Good performance with some areas for improvement.');
  } else {
    console.log('❌ Performance issues detected. Review recommendations before production use.');
  }

  // Save results
  saveBenchmarkResults(results);

  return results;
};

/**
 * CLI runner
 */
const main = async () => {
  try {
    await runComprehensiveBenchmark();
    console.log('\n✨ Comprehensive benchmark completed successfully!');
  } catch (error) {
    console.error('\n💥 Comprehensive benchmark failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

export { runComprehensiveBenchmark, collectSystemInfo, generateReport };
