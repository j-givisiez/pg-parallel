# 📚 pg-parallel Documentation

Welcome to the comprehensive documentation for `pg-parallel`. This directory
contains detailed technical documentation, performance analysis, and
optimization guides.

## 📁 Documentation Index

### 🚀 Performance & Benchmarks

- **[benchmark-improvements.md](./benchmark-improvements.md)** - Technical
  details of benchmark system improvements, optimization methodologies, and
  performance analysis
- **[performance-comparison.md](./performance-comparison.md)** - Comprehensive
  comparison between pg-parallel and pg.Pool with detailed metrics and
  recommendations

## 📊 Quick Reference

### Performance Summary (Corrected - Realistic Configuration)

| Load Type   | pg-parallel Performance | vs pg.Pool | Error Rate | Configuration |
| ----------- | ----------------------- | ---------- | ---------- | ------------- |
| Light Load  | 6,289 ops/sec           | **+5.4%**  | 0%         | maxWorkers: 1 |
| Medium Load | 13,477 ops/sec          | -12.4%     | 0%         | maxWorkers: 1 |
| Heavy Load  | 15,432 ops/sec          | -11.1%     | 0%         | maxWorkers: 1 |

### Key Findings (Updated)

- ✅ **Light Load Champion**: pg-parallel now 5.4% faster than pg.Pool
- ✅ **Configuration Critical**: maxWorkers: 1 essential for optimal I/O
  performance
- ✅ **Zero Errors**: Both libraries maintain 0% error rate with realistic loads
- ✅ **Mixed Workload Dominance**: 2.97x faster for CPU + I/O combined
  operations
- 🚀 **Warmup Critical**: 1,135% performance improvement with proper warmup

### When to Use Each (Updated)

**Use pg-parallel for:**

- **Light I/O workloads** (5-8% performance advantage)
- **Production systems** requiring circuit breaker and retry logic
- **Mixed I/O + CPU workloads** (2.97x faster than sequential)
- **Applications with reliability requirements**
- **Worker thread requirements** for CPU-intensive tasks

**Use pg.Pool for:**

- **Very heavy I/O workloads** where 10-12% raw speed gain is critical
- **Simple prototypes** where setup simplicity is preferred
- **Non-resilience critical systems** without fault tolerance needs

## 🔗 Related Links

- [Main README](../README.md) - Project overview and getting started
- [Examples](../examples/) - Working code examples
- [Source Code](../src/) - Library implementation
- [Tests](./__tests__/) - Test suite and validation

## 📈 Performance Testing

To run performance benchmarks yourself:

```bash
# Enhanced I/O benchmark
npm run benchmark:enhanced

# Load and stress testing
npm run benchmark:load

# Resilience testing
npm run benchmark:resilience

# Comprehensive benchmark suite
npm run benchmark:comprehensive
```

## 📝 Contributing

When updating documentation:

1. Keep all files in English
2. Use lowercase kebab-case for file names
3. Update this index when adding new docs
4. Include performance data with latest benchmark results
5. Maintain consistent formatting and style

## 🏷️ Document Versions

| Document                  | Last Updated | Benchmark Version  |
| ------------------------- | ------------ | ------------------ |
| benchmark-improvements.md | Latest       | Enhanced precision |
| performance-comparison.md | Latest       | Latest results     |
| README.md (this file)     | Latest       | Current            |

---

For questions about this documentation, please check the
[main project issues](https://github.com/j-givisiez/pg-parallel/issues) or
create a new issue.
