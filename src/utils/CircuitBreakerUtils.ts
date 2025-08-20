/**
 * @file Utilities for circuit breaker pattern implementation
 */

import { CircuitBreakerConfig } from '../types';

/**
 * Circuit breaker state
 */
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker state manager
 */
export interface CircuitBreakerState {
  state: BreakerState;
  consecutiveFailures: number;
  halfOpenAllowedCalls: number;
  halfOpenSuccesses: number;
  openedAt: number;
}

/**
 * Circuit breaker utilities for pg-parallel
 */
export class CircuitBreakerUtils {
  /**
   * Creates initial circuit breaker state
   * @returns Initial circuit breaker state
   */
  static createInitialState(): CircuitBreakerState {
    return {
      state: 'CLOSED',
      consecutiveFailures: 0,
      halfOpenAllowedCalls: 0,
      halfOpenSuccesses: 0,
      openedAt: 0,
    };
  }

  /**
   * Gets default circuit breaker configuration
   * @returns Default circuit breaker configuration
   */
  static getDefaultConfig(): CircuitBreakerConfig {
    return {
      failureThreshold: 5,
      cooldownMs: 10_000,
      halfOpenMaxCalls: 2,
      halfOpenSuccessesToClose: 2,
    };
  }

  /**
   * Ensures the circuit breaker state is correct based on timing
   * @param state - Circuit breaker state to update
   * @param config - Circuit breaker configuration
   * @param logger - Optional logger for state transitions
   */
  static async ensureBreakerState(
    state: CircuitBreakerState,
    config: CircuitBreakerConfig,
    logger?: {
      info?: (message: string, meta?: Record<string, unknown>) => void;
      warn?: (message: string, meta?: Record<string, unknown>) => void;
    },
  ): Promise<void> {
    if (state.state === 'OPEN') {
      const elapsed = Date.now() - state.openedAt;
      if (elapsed >= config.cooldownMs) {
        state.state = 'HALF_OPEN';
        state.halfOpenSuccesses = 0;
        state.halfOpenAllowedCalls = config.halfOpenMaxCalls;
        logger?.info?.('Breaker HALF_OPEN');
      }
    }

    if (state.state === 'HALF_OPEN') {
      if (state.halfOpenAllowedCalls <= 0) {
        throw new Error('Circuit breaker trial limit reached');
      }
      state.halfOpenAllowedCalls -= 1;
    }
  }

  /**
   * Handles circuit breaker success
   * @param state - Circuit breaker state to update
   * @param config - Circuit breaker configuration
   * @param logger - Optional logger for events
   */
  static onBreakerSuccess(
    state: CircuitBreakerState,
    config: CircuitBreakerConfig,
    logger?: {
      info?: (message: string, meta?: Record<string, unknown>) => void;
    },
  ): void {
    if (state.state === 'HALF_OPEN') {
      state.halfOpenSuccesses += 1;
      if (state.halfOpenSuccesses >= config.halfOpenSuccessesToClose) {
        state.state = 'CLOSED';
        state.consecutiveFailures = 0;
        logger?.info?.('Breaker CLOSED after successful half-open trials');
      }
    } else {
      state.consecutiveFailures = 0;
    }
  }

  /**
   * Handles circuit breaker failure
   * @param state - Circuit breaker state to update
   * @param config - Circuit breaker configuration
   * @param logger - Optional logger for events
   */
  static onBreakerFailure(
    state: CircuitBreakerState,
    config: CircuitBreakerConfig,
    logger?: {
      warn?: (message: string, meta?: Record<string, unknown>) => void;
    },
  ): void {
    state.consecutiveFailures += 1;

    if (state.state === 'HALF_OPEN') {
      this.openBreaker(state, config, logger);
      return;
    }

    if (state.consecutiveFailures >= config.failureThreshold && state.state === 'CLOSED') {
      this.openBreaker(state, config, logger);
    }
  }

  /**
   * Opens the circuit breaker
   * @param state - Circuit breaker state to update
   * @param config - Circuit breaker configuration
   * @param logger - Optional logger for events
   */
  static openBreaker(
    state: CircuitBreakerState,
    config: CircuitBreakerConfig,
    logger?: {
      warn?: (message: string, meta?: Record<string, unknown>) => void;
    },
  ): void {
    state.state = 'OPEN';
    state.openedAt = Date.now();
    state.halfOpenAllowedCalls = config.halfOpenMaxCalls;
    state.halfOpenSuccesses = 0;
    logger?.warn?.('Breaker OPENED');
  }
}
