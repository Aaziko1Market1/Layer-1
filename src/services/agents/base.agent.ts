import { logger } from '../../config/logger';

/**
 * Base Agent Class
 * Provides common utilities for all agents: timeout, retry, error handling
 */
export class BaseAgent {
  protected agentName: string;

  constructor(agentName: string) {
    this.agentName = agentName;
  }

  /**
   * Execute a function with timeout
   */
  protected async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    operation: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Execute a function with retry logic (exponential backoff)
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    operation: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;

        // Check if it's a rate limit error
        const isRateLimit =
          err.response?.status === 429 ||
          err.response?.status === 403 ||
          err.message?.toLowerCase().includes('rate limit');

        if (!isRateLimit || attempt === maxRetries) {
          throw err;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        logger.warn(`${this.agentName}: ${operation} rate limited, retrying in ${delayMs}ms`, {
          attempt,
          maxRetries,
        });
        await this.sleep(delayMs);
      }
    }

    throw lastError || new Error(`${operation} failed after ${maxRetries} retries`);
  }

  /**
   * Safe execution wrapper with error handling
   */
  protected async safeExecute<T>(
    fn: () => Promise<T>,
    operation: string,
    fallback: T
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      logger.error(`${this.agentName}: ${operation} failed`, {
        error: err.message,
        stack: err.stack,
      });
      return fallback;
    }
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log agent start
   */
  protected logStart(buyerName: string, operation: string): void {
    logger.info(`${this.agentName}: Starting ${operation}`, { buyer: buyerName });
  }

  /**
   * Log agent complete
   */
  protected logComplete(buyerName: string, operation: string, durationMs: number): void {
    logger.info(`${this.agentName}: Completed ${operation}`, {
      buyer: buyerName,
      durationMs,
      durationSec: (durationMs / 1000).toFixed(1),
    });
  }

  /**
   * Log agent error
   */
  protected logError(buyerName: string, operation: string, error: string): void {
    logger.error(`${this.agentName}: ${operation} failed`, {
      buyer: buyerName,
      error,
    });
  }
}

