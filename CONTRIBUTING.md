# Contributing to pg-parallel

[![Contributors Welcome](https://img.shields.io/badge/contributors-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-enforced-blue.svg)](#code-of-conduct)
[![Conventional Commits](https://img.shields.io/badge/conventional%20commits-required-orange.svg)](https://www.conventionalcommits.org/)

Thank you for considering contributing to `pg-parallel`! 🎉

This document provides comprehensive guidelines for contributing to the project.
We want to make the process as simple and welcoming as possible for contributors
of all experience levels.

## Table of Contents

- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#-reporting-bugs)
  - [Suggesting Enhancements](#-suggesting-enhancements)
  - [Contributing Code](#-contributing-code)
- [Development Setup](#development-setup)
  - [Environment Setup](#environment-setup)
  - [Database Configuration](#database-configuration)
  - [Verification](#verification)
- [Development Workflow](#development-workflow)
  - [Creating a Branch](#creating-a-branch)
  - [Making Changes](#making-changes)
  - [Testing Changes](#testing-changes)
- [Code Standards](#code-standards)
  - [TypeScript Guidelines](#typescript-guidelines)
  - [Code Style](#code-style)
  - [Documentation Requirements](#documentation-requirements)
  - [Architecture Principles](#architecture-principles)
- [Testing Guidelines](#testing-guidelines)
  - [Running Tests](#running-tests)
  - [Writing Tests](#writing-tests)
  - [Integration Tests](#integration-tests)
- [Commit and Pull Request Process](#commit-and-pull-request-process)
  - [Commit Messages](#commit-messages)
  - [Pull Request Guidelines](#pull-request-guidelines)
  - [Review Process](#review-process)
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Getting Help](#getting-help)
- [Acknowledgments](#acknowledgments)

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating a bug report, please check if the issue already exists in our
[GitHub Issues](https://github.com/j-givisiez/pg-parallel/issues).

**When reporting bugs:**

- **Use the bug issue template** provided in the repository
- **Include environment information:**
  - Node.js version (`node --version`)
  - PostgreSQL version (`psql --version`)
  - Operating system and version
  - `pg-parallel` version
- **Describe the steps to reproduce** the problem clearly
- **Include a minimal reproducible example** when possible
- **Attach relevant logs** or error messages
- **Describe expected vs actual behavior**

**Example bug report structure:**

````markdown
## Bug Description

Brief description of the issue

## Environment

- Node.js: v18.17.0
- PostgreSQL: 15.3
- OS: macOS 13.4
- pg-parallel: 1.1.1

## Steps to Reproduce

1. Step one
2. Step two
3. Step three

## Expected Behavior

What should happen

## Actual Behavior

What actually happens

## Minimal Example

```ts
// Code that reproduces the issue
```
````

````

### 💡 Suggesting Enhancements

We welcome suggestions for new features and improvements!

**When suggesting enhancements:**

- **Use the feature request issue template**
- **Explain the problem** the enhancement would solve
- **Describe your proposed solution** in detail
- **Consider alternatives** you've thought about
- **Provide use cases** where this would be beneficial
- **Check alignment** with project goals and scope

**Enhancement categories we're interested in:**
- Performance improvements
- New worker patterns
- Better error handling
- Enhanced TypeScript support
- Documentation improvements
- Developer experience enhancements

### 🔧 Contributing Code

We appreciate code contributions! Please follow the guidelines below to ensure a smooth process.

## Development Setup

### Environment Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/pg-parallel.git
   cd pg-parallel
````

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Verify installation:**
   ```bash
   npm run build
   npm run lint
   ```

### Database Configuration

For running tests and examples, you'll need a PostgreSQL database:

1. **Install PostgreSQL** (if not already installed):

   ```bash
   # macOS (using Homebrew)
   brew install postgresql

   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib

   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Start PostgreSQL service:**

   ```bash
   # macOS
   brew services start postgresql

   # Linux
   sudo systemctl start postgresql
   ```

3. **Create test database:**

   ```bash
   createdb pg_parallel_test
   createdb pg_parallel_examples
   ```

4. **Configure environment variables:**
   ```bash
   # Create .env file in project root
   echo 'DATABASE_URL="postgresql://username:password@localhost:5432/pg_parallel_test"' > .env
   ```

### Verification

Verify your setup by running:

```bash
# Run all tests
npm test

# Run examples
npm run example:01  # If you've added this script
# or
ts-node examples/01-basic-query.ts
```

## Development Workflow

### Creating a Branch

Create a descriptive branch for your work:

```bash
# Feature branches
git checkout -b feature/add-connection-pooling
git checkout -b feature/improve-error-handling

# Bug fix branches
git checkout -b fix/worker-memory-leak
git checkout -b fix/connection-timeout

# Documentation branches
git checkout -b docs/update-api-reference
git checkout -b docs/add-performance-guide
```

### Making Changes

1. **Follow existing code patterns** and conventions
2. **Add tests** for new functionality
3. **Update documentation** as needed
4. **Ensure backward compatibility** when possible
5. **Test thoroughly** before committing

### Testing Changes

Before submitting your changes:

```bash
# Run the full test suite
npm test

# Check code formatting
npm run lint

# Build the project
npm run build

# Test examples (if applicable)
ts-node examples/01-basic-query.ts
```

## Code Standards

### TypeScript Guidelines

- **Use TypeScript** for all new code with strict typing
- **Avoid `any` type** - use proper type definitions
- **Export interfaces** for public APIs
- **Use generics** where appropriate for reusability
- **Document complex types** with JSDoc comments

**Example:**

```ts
/**
 * Configuration options for PgParallel instance
 */
export interface PgParallelConfig extends PoolConfig {
  /** Maximum number of worker threads to spawn */
  maxWorkers?: number;
}
```

### Code Style

- **Formatting**: The project uses Prettier with 120 character line width
- **Imports**: Organize imports logically:
  1. Node.js built-ins
  2. External packages
  3. Local modules
- **Naming**: Use descriptive names:
  - Classes: `PascalCase` (e.g., `ParallelClient`)
  - Functions/variables: `camelCase` (e.g., `executeWorker`)
  - Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_MAX_WORKERS`)

### Documentation Requirements

- **JSDoc**: Use JSDoc for all public interfaces, classes, and methods
- **No inline comments** in `.js` and `.ts` files - only JSDoc documentation
- **Parameter documentation**: Document all parameters and return values
- **Examples**: Include usage examples in JSDoc when helpful

**Example:**

````ts
/**
 * Executes a CPU-intensive task in a worker thread
 *
 * @param task Function to execute in worker
 * @param args Arguments to pass to the task function
 * @returns Promise that resolves with the task result
 *
 * @example
 * ```ts
 * const result = await db.task(fibonacci, [40]);
 * console.log(result); // 102334155
 * ```
 */
public async task<T>(task: Function, args: any[]): Promise<T>
````

### Architecture Principles

- **Follow SOLID principles**
- **Separation of concerns**: Keep different responsibilities separate
- **Single responsibility**: Each class/function should have one purpose
- **Dependency injection**: Use dependency injection where appropriate
- **Error handling**: Use descriptive error messages and proper error
  propagation

## Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- worker-file-task.test.ts

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- **Test structure**: Use `describe` and `it` blocks appropriately
- **Test names**: Use descriptive test names that explain what is being tested
- **Arrange-Act-Assert**: Structure tests clearly
- **Mock external dependencies** when appropriate
- **Test edge cases** and error conditions

**Example test structure:**

```ts
describe('PgParallel', () => {
  describe('worker method', () => {
    it('should execute simple worker function successfully', async () => {
      // Arrange
      const db = new PgParallel(config);

      // Act
      const result = await db.worker(async (client) => {
        return 'test result';
      });

      // Assert
      expect(result).toBe('test result');
    });
  });
});
```

### Integration Tests

- **Database setup**: Use test database for integration tests
- **Cleanup**: Ensure tests clean up after themselves
- **Isolation**: Tests should not depend on each other
- **Performance**: Consider test execution time

## Commit and Pull Request Process

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
# Features
feat: add support for connection pooling
feat(worker): implement file-based worker execution

# Bug fixes
fix: resolve memory leak in worker threads
fix(types): correct WorkerFileTask interface definition

# Documentation
docs: update API reference for worker methods
docs(examples): add advanced usage examples

# Tests
test: add integration tests for worker functionality
test(unit): improve coverage for error handling

# Refactoring
refactor: simplify worker thread management
refactor(types): reorganize type definitions

# Performance
perf: optimize worker thread creation
perf(query): reduce overhead for simple queries
```

### Pull Request Guidelines

**Before submitting a PR:**

1. **Ensure all tests pass** locally
2. **Update documentation** if needed
3. **Add tests** for new functionality
4. **Follow code standards** outlined above
5. **Rebase your branch** on the latest main

**PR description should include:**

- **Clear description** of changes made
- **Motivation** for the changes
- **Testing** performed
- **Breaking changes** (if any)
- **Related issues** (use "Fixes #123" or "Closes #123")

**Example PR template:**

```markdown
## Description

Brief description of changes

## Motivation

Why these changes are needed

## Changes Made

- List of specific changes
- Another change
- Third change

## Testing

- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Manual testing performed

## Breaking Changes

None / List any breaking changes

## Related Issues

Fixes #123
```

### Review Process

- **PRs are reviewed** by maintainers
- **We may request changes** or clarifications
- **Stay open to feedback** - it helps improve the code
- **Don't worry about iterations** - we often need a few rounds
- **Reviews focus on:**
  - Code quality and standards
  - Test coverage
  - Documentation completeness
  - Performance implications
  - Backward compatibility

## Code of Conduct

We are committed to providing a welcoming and inclusive environment:

- **Be respectful and welcoming** to all contributors
- **Focus on the code, not the person** during reviews
- **Help other contributors** when you can
- **Keep discussions constructive** and professional
- **Respect different viewpoints** and experiences
- **Report unacceptable behavior** to project maintainers

## Getting Started

If you're new to the project, here are some suggestions:

### Good First Issues

Look for issues labeled with:

- `good first issue`: Perfect for getting started
- `help wanted`: We'd especially appreciate help with these
- `documentation`: Documentation improvements
- `tests`: Adding test cases

### Areas to Contribute

1. **Documentation**: There's always room for improvement

   - API documentation
   - Usage examples
   - Performance guides
   - Troubleshooting guides

2. **Tests**: Adding test cases is always welcome

   - Unit tests for edge cases
   - Integration tests for real scenarios
   - Performance benchmarks

3. **Examples**: Creating usage examples helps others

   - Real-world use cases
   - Performance comparisons
   - Integration patterns

4. **Code**: New features and improvements
   - Performance optimizations
   - Error handling improvements
   - New worker patterns

### Learning Resources

- **Project README**: Start with the main documentation
- **Examples directory**: Review existing examples
- **Test files**: See how features are tested
- **Issues**: Browse open issues for ideas

## Getting Help

Don't hesitate to ask for help:

- **Open an issue** for questions or discussions
- **Comment on existing issues** if you need clarification
- **Reach out to maintainers** if you're stuck
- **Join community discussions** when available

**We're here to help make your contribution successful!**

## Acknowledgments

Thank you for contributing to make `pg-parallel` better for everyone! 🙏

Every contribution, no matter how small, helps improve the project:

- Bug reports help us identify issues
- Feature suggestions guide our roadmap
- Code contributions add functionality
- Documentation improvements help users
- Reviews and feedback improve quality

---

**Happy contributing!** 🚀

_This document is a living guide. Suggestions to improve it are always welcome!_
