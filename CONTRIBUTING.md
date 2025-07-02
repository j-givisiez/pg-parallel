# Contributing to pg-parallel

Thank you for considering contributing to `pg-parallel`! 🎉

This document provides guidelines for contributing to the project. We want to make the process as simple and welcoming as possible.

## How Can I Contribute?

### 🐛 Reporting Bugs

- Use the bug issue template
- Include information about your environment (Node.js, PostgreSQL, OS)
- Describe the steps to reproduce the problem
- If possible, include a minimal reproducible example

### 💡 Suggesting Enhancements

- Use the feature request issue template
- Explain the problem the enhancement would solve
- Describe how you would like it to work
- Consider if the enhancement aligns with the project's goals

### 🔧 Contributing Code

#### Environment Setup

1. Fork the repository
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/pg-parallel.git
   cd pg-parallel
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Configure the database for tests (see testing section)

#### Development

- Create a branch for your feature/fix:
  ```bash
  git checkout -b feature/new-feature
  ```
- Follow existing code patterns
- Add tests for new functionality
- Ensure all tests pass

#### Code Standards

- **TypeScript**: Use TypeScript for all new code with strict typing
- **Formatting**: The project uses Prettier with 120 character line width
- **Documentation**: Use JSDoc for all public interfaces, classes, and methods
- **Comments**: No inline comments in `.js` and `.ts` files - only JSDoc documentation
- **Logs**: Follow the standard without icons/emojis and without periods (e.g., "Worker thread started successfully")
- **Architecture**: Follow DDD and SOLID principles
- **Imports**: Use explicit imports and organize them logically (Node.js built-ins first, then external packages, then local modules)
- **Error Handling**: Use descriptive error messages and proper error propagation
- **Naming**: Use descriptive names for variables, functions, and classes (e.g., `ParallelClient`, `PgParallelConfig`)

#### Testing

- Run tests before submitting:
  ```bash
  npm test
  ```
- For integration tests, configure a local PostgreSQL database
- Maintain high test coverage

#### Commit and Pull Request

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  ```
  feat: add new functionality
  fix: fix connection bug
  docs: update documentation
  test: add tests for new feature
  ```
- Clearly describe changes in the PR
- Reference related issues
- Wait for review before merging

## Review Process

- PRs are reviewed by maintainers
- We may request changes or clarifications
- Stay open to constructive feedback
- Don't worry if we need a few iterations

## Code of Conduct

- Be respectful and welcoming
- Focus on the code, not the person
- Help other contributors
- Keep discussions constructive

## Getting Started

If you're new to the project, here are some suggestions:

1. **Issues with "good first issue" label**: Perfect for getting started
2. **Documentation**: There's always room for improvement
3. **Tests**: Adding test cases is always welcome
4. **Examples**: Creating usage examples can help others

## Questions?

- Open an issue for discussions
- Contact the maintainers
- Don't hesitate to ask - we're here to help!

## Acknowledgments

Thank you for contributing to make `pg-parallel` better for everyone! 🙏

---

_This document is a work in progress. Suggestions to improve it are always welcome!_
