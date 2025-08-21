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

### Performance Summary

| Load Type   | pg-parallel Performance | vs pg.Pool | Error Rate |
| ----------- | ----------------------- | ---------- | ---------- |
| Light Load  | 9,378 ops/sec           | -27.2%     | 0%         |
| Medium Load | 8,277 ops/sec           | -42.1%     | 0%         |
| Heavy Load  | 5,167 ops/sec           | -61.7%     | 0%         |

### Key Findings

- ✅ **Zero Errors**: pg-parallel maintains 0% error rate under all load
  conditions
- ❌ **pg.Pool Failures**: 4.67% error rate under heavy load (467 errors)
- 🚀 **Warmup Critical**: 1,135% performance improvement with proper warmup
- 🎯 **Trade-off**: Sacrifices raw speed for 100% reliability

### When to Use Each

**Use pg-parallel for:**

- Production systems requiring zero errors
- Mixed I/O + CPU workloads
- Applications needing circuit breaker and retry logic
- Worker thread requirements

**Use pg.Pool for:**

- Maximum I/O speed requirements
- Simple CRUD operations
- Non-critical systems where occasional errors are acceptable

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
