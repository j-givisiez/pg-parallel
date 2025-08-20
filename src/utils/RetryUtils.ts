/**
 * @file Utilities for retry logic with exponential backoff
 */

import { RetryConfig } from '../types';
import { ErrorUtils } from './ErrorUtils';

/**
 * Retry utilities for pg-parallel
 */
export class RetryUtils {
  /**
   * Executes a function with retry logic using exponential backoff with optional jitter.
   * @param fn - The function to execute with retries
   * @param config - Retry configuration
   * @param opName - Operation name for logging
   * @param logger - Optional logger for retry events
   * @returns Promise that resolves with the function result
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig,
    opName: string,
    logger?: {
      info?: (message: string, meta?: Record<string, unknown>) => void;
    },
  ): Promise<T> {
    let attempt = 0;
    let delay = Math.max(0, config.initialDelayMs);
    const maxDelay = Math.max(delay, config.maxDelayMs);
    const shouldRetry = config.retryOn ?? ((err) => ErrorUtils.isTransient(err));

    while (true) {
      attempt += 1;
      try {
        if (attempt > 1) {
          logger?.info?.('Retrying operation', { opName, attempt });
        }
        const result = await fn();
        return result;
      } catch (error) {
        const canRetry = attempt < config.maxAttempts && shouldRetry(error);
        if (!canRetry) throw error;

        const jitter = config.jitter ? Math.random() * 0.25 * delay : 0;
        const wait = Math.min(maxDelay, delay + jitter);
        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(maxDelay, Math.ceil(delay * config.backoffFactor));
      }
    }
  }
}
