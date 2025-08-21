/**
 * @file Utilities for error handling, categorization and wrapping
 */

import { ErrorCategory, PgParallelError } from '../types';

/**
 * Error handling utilities for pg-parallel
 */
export class ErrorUtils {
  // Pre-computed sets for faster categorization
  private static readonly FAST_TRANSIENT_CODES = new Set([
    'ETIMEDOUT',
    '57014',
    'ECONNRESET',
    'ECONNREFUSED',
    '57P01',
    '57P02',
    '40001',
    '40P01',
  ]);

  private static readonly TRANSIENT_CATEGORIES = new Set([
    'TRANSIENT',
    'CONNECTION',
    'TIMEOUT',
    'DEADLOCK',
    'SERIALIZATION',
  ]);

  /**
   * Returns true if the error is likely transient and worth retrying.
   * Optimized with fast path for common error codes.
   * @param error - The error to analyze
   * @returns True if the error should be retried
   */
  static isTransient(error: unknown): boolean {
    if (!error) return false;

    const err: any = error as any;
    const code: string | undefined = err?.code;

    // Fast path: Check common transient codes directly
    if (code && this.FAST_TRANSIENT_CODES.has(code)) {
      return true;
    }

    // Fast path: Check message for timeout keywords
    const message: string | undefined = err?.message;
    if (message && typeof message === 'string') {
      const lowerMessage = message.toLowerCase();
      if (
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('connection') ||
        lowerMessage.includes('deadlock')
      ) {
        return true;
      }
    }

    // Fallback: Full categorization for edge cases
    const category = this.categorizeError(error);
    return this.TRANSIENT_CATEGORIES.has(category);
  }

  // Pre-computed categorization maps for O(1) lookup
  private static readonly CODE_CATEGORY_MAP = new Map<string, ErrorCategory>([
    // Serialization errors
    ['40001', 'SERIALIZATION'],
    // Deadlock errors
    ['40P01', 'DEADLOCK'],
    // Timeout errors
    ['ETIMEDOUT', 'TIMEOUT'],
    ['57014', 'TIMEOUT'],
    // Connection errors
    ['ECONNRESET', 'CONNECTION'],
    ['ECONNREFUSED', 'CONNECTION'],
    ['57P01', 'CONNECTION'],
    ['57P02', 'CONNECTION'],
  ]);

  /**
   * Categorizes errors based on pg error codes and common Node.js error codes.
   * Optimized with lookup tables for better performance.
   * @param error - The error to categorize
   * @returns The error category
   */
  static categorizeError(error: unknown): ErrorCategory {
    const err: any = error as any;
    const code: string | undefined = err?.code;
    const name: string | undefined = err?.name;
    const message: string | undefined = err?.message;

    if (name === 'AggregateError' && Array.isArray(err?.errors) && err.errors.length > 0) {
      return this.categorizeError(err.errors[0]);
    }

    // Fast path: O(1) lookup for common codes
    if (code && this.CODE_CATEGORY_MAP.has(code)) {
      return this.CODE_CATEGORY_MAP.get(code)!;
    }

    // Fast path: Check code prefixes (PostgreSQL error families)
    if (code) {
      if (code.startsWith('23')) return 'CONSTRAINT';
      if (code.startsWith('42')) return 'SYNTAX';
    }

    // Slower path: Check error names and messages
    if (name === 'SequelizeConnectionError') return 'CONNECTION';

    if (message && typeof message === 'string') {
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('timeout')) return 'TIMEOUT';
      if (lowerMessage.includes('connection')) return 'CONNECTION';
      if (lowerMessage.includes('deadlock')) return 'DEADLOCK';
    }

    return 'UNKNOWN';
  }

  /**
   * Wraps any error into PgParallelError with a category.
   * Optimized to avoid re-wrapping and unnecessary categorization.
   * @param error - The error to wrap
   * @returns A PgParallelError instance
   */
  static wrapError(error: unknown): PgParallelError {
    // Fast path: Already wrapped
    if (error instanceof PgParallelError) return error;

    const aggregate: any = error as any;
    let baseError: any = error;

    // Handle AggregateError
    if (aggregate?.name === 'AggregateError' && Array.isArray(aggregate.errors) && aggregate.errors.length > 0) {
      baseError = aggregate.errors[0];
      // If the nested error is already wrapped, return it
      if (baseError instanceof PgParallelError) return baseError;
    }

    const category = this.categorizeError(baseError);
    let message = baseError?.message;

    // Fast path: Use existing message or fallback
    if (!message || typeof message !== 'string' || message.trim() === '') {
      message = 'Unknown error';
    }

    return new PgParallelError(message, category, error);
  }
}
