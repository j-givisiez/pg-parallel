# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-07-XX

### Added

- Initial release of `pg-parallel`
- `PgParallel` class with hybrid pool architecture
- `query()` method for standard I/O operations using main thread pool
- `task()` method for pure CPU-bound operations in worker threads
- `worker()` method for mixed database/CPU workloads with dedicated client
- Automatic client lifecycle management (no manual `client.release()` needed)
- Lazy worker thread initialization for optimal resource usage
- Full TypeScript support with strict typing and comprehensive interfaces
- Configurable worker thread pool (defaults to CPU core count)
- Hybrid architecture: fast I/O on main thread, heavy work on workers
- Automatic connection pooling and load balancing
- Graceful shutdown with proper resource cleanup
- Comprehensive Jest test suite with TypeScript support
- Integration tests for all major API methods
- PostgreSQL connection testing with proper setup/teardown
- Build verification script to test compiled artifacts
- Detailed README with usage examples and API documentation
- Performance benchmarks showing real-world improvements
- Contributing guidelines with code standards
- Advanced usage patterns and best practices
- Troubleshooting guide and common pitfalls
- Prettier configuration with 120 character line width
- TypeDoc setup for API documentation generation
- GitHub Actions CI/CD pipeline with Node.js matrix testing
- Security audit integration with npm audit
- Comprehensive ignore files for Git and npm
- Environment configuration example (.env.example)

### Technical Details

- **Node.js Support**: Requires Node.js v15.14.0 or higher
- **PostgreSQL**: Compatible with `pg` v8.11.3+ (peer dependency)
- **Performance**: Minimal overhead for I/O operations, significant gains for
  CPU-intensive tasks
- **Error Handling**: Descriptive error messages with proper propagation

### Breaking Changes

- None (initial release)

### Migration Guide

- N/A (initial release)

## [1.0.1] - 2025-07-XX

### Added

- Automatic npm publishing via GitHub Actions
- CI status badge and direct links to npm/GitHub in `README.md`
- Build verification script (`dist-test.js`) for post-compilation testing

### Changed

- Adjusted test timeouts to prevent intermittent failures in CI
- Updated documentation and CI workflow with the correct Node.js version

## [1.0.2] - 2025-07-XX

### Fixed

- Added `repository` field to `package.json` to fix npm provenance error

## [1.0.3] - 2025-07-XX

### Fixed

- Excluded benchmark files from the npm package by updating `tsconfig.json`

---

## [Unreleased]

### Planned

- Additional performance optimizations
- Enhanced error handling and recovery
- More comprehensive benchmarking tools
- Extended documentation and examples

[1.0.0]: https://github.com/j-givisiez/pg-parallel/releases/tag/v1.0.0
[1.0.1]: https://github.com/j-givisiez/pg-parallel/compare/v1.0.0...v1.0.1
[1.0.2]: https://github.com/j-givisiez/pg-parallel/compare/v1.0.1...v1.0.2
[1.0.3]: https://github.com/j-givisiez/pg-parallel/compare/v1.0.2...v1.0.3
[Unreleased]: https://github.com/j-givisiez/pg-parallel/compare/v1.0.3...HEAD
