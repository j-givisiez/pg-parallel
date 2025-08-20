/**
 * @file Utilities for error handling, categorization and wrapping
 */

import { ErrorCategory, PgParallelError } from '../types';

/**
 * Error handling utilities for pg-parallel
 */
export class ErrorUtils {
  /**
   * Returns true if the error is likely transient and worth retrying.
   * @param error - The error to analyze
   * @returns True if the error should be retried
   */
  static isTransient(error: unknown): boolean {
    const category = this.categorizeError(error);
    return (
      category === 'TRANSIENT' ||
      category === 'CONNECTION' ||
      category === 'TIMEOUT' ||
      category === 'DEADLOCK' ||
      category === 'SERIALIZATION'
    );
  }

  /**
   * Categorizes errors based on pg error codes and common Node.js error codes.
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

    if (code === '40001') return 'SERIALIZATION';
    if (code === '40P01') return 'DEADLOCK';
    if (code === 'ETIMEDOUT' || code === '57014') return 'TIMEOUT';
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === '57P01' || code === '57P02') return 'CONNECTION';
    if (code && code.startsWith('23')) return 'CONSTRAINT';
    if (code && code.startsWith('42')) return 'SYNTAX';

    if (name === 'SequelizeConnectionError') return 'CONNECTION';
    if (message && /timeout/i.test(message)) return 'TIMEOUT';
    if (message && /connection/i.test(message)) return 'CONNECTION';
    if (message && /deadlock/i.test(message)) return 'DEADLOCK';

    return 'UNKNOWN';
  }

  /**
   * Wraps any error into PgParallelError with a category.
   * @param error - The error to wrap
   * @returns A PgParallelError instance
   */
  static wrapError(error: unknown): PgParallelError {
    if (error instanceof PgParallelError) return error;
    const aggregate: any = error as any;
    let baseError: any = error;
    if (
      aggregate &&
      aggregate.name === 'AggregateError' &&
      Array.isArray(aggregate.errors) &&
      aggregate.errors.length > 0
    ) {
      baseError = aggregate.errors[0];
    }

    const category = this.categorizeError(baseError);
    let message = baseError?.message;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      message = 'Unknown error';
    }

    return new PgParallelError(message, category, error);
  }
}
