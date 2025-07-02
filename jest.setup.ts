/**
 * @file Jest setup file.
 * This file is executed before each test file.
 */

let errorSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  // Mock console.error and console.log to hide noisy but expected output during tests,
  // such as worker termination errors when tests are intentionally causing failures.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  // Restore original console functionality after each test
  errorSpy.mockRestore();
  logSpy.mockRestore();
});
