/**
 * Token bucket rate limiter
 * Based on merinfo_scraper rate limiting patterns
 */

import { RateLimitError } from '../types.js';
import { logger, logRateLimit } from './logger.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  /**
   * Check if request is allowed and consume a token
   */
  async checkLimit(identifier: string): Promise<boolean> {
    const bucket = this.getBucket(identifier);
    this.refillBucket(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      logger.debug({ identifier, tokens_remaining: bucket.tokens }, 'Rate limit check: allowed');
      return true;
    }

    const waitTime = this.getWaitTime(bucket);
    logRateLimit(identifier, waitTime);
    return false;
  }

  /**
   * Wait for an available slot
   */
  async waitForSlot(identifier: string): Promise<void> {
    const bucket = this.getBucket(identifier);
    const waitTime = this.getWaitTime(bucket);

    if (waitTime > 0) {
      logger.info({ identifier, wait_ms: waitTime }, 'Waiting for rate limit slot');
      await this.sleep(waitTime);
      this.refillBucket(bucket);
      bucket.tokens -= 1;
    } else {
      bucket.tokens -= 1;
    }
  }

  /**
   * Get time until next token is available
   */
  getWaitTime(bucket: TokenBucket): number {
    if (bucket.tokens >= 1) return 0;

    const tokensNeeded = 1 - bucket.tokens;
    const msNeeded = tokensNeeded / bucket.refillRate;
    return Math.ceil(msNeeded);
  }

  /**
   * Get or create bucket for identifier
   */
  private getBucket(identifier: string): TokenBucket {
    let bucket = this.buckets.get(identifier);

    if (!bucket) {
      bucket = {
        tokens: this.maxRequests,
        lastRefill: Date.now(),
        maxTokens: this.maxRequests,
        refillRate: this.maxRequests / this.windowMs,
      };
      this.buckets.set(identifier, bucket);
    }

    return bucket;
  }

  /**
   * Refill bucket based on time elapsed
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getStatus(identifier: string): {
    requests_remaining: number;
    window_reset_at: string;
  } {
    const bucket = this.getBucket(identifier);
    this.refillBucket(bucket);

    const resetMs = this.getWaitTime(bucket);
    const resetAt = new Date(Date.now() + resetMs);

    return {
      requests_remaining: Math.floor(bucket.tokens),
      window_reset_at: resetAt.toISOString(),
    };
  }

  /**
   * Clear all rate limit state
   */
  reset(): void {
    this.buckets.clear();
    logger.info('Rate limiter reset');
  }
}

/**
 * Exponential backoff utility
 * Based on merinfo_scraper backoff patterns
 */
export class BackoffStrategy {
  constructor(
    private initialDelayMs: number = 2000,
    private maxDelayMs: number = 30000,
    private multiplier: number = 2,
    private jitter: boolean = true
  ) {}

  /**
   * Calculate delay for attempt number
   */
  getDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.initialDelayMs * Math.pow(this.multiplier, attempt - 1),
      this.maxDelayMs
    );

    if (!this.jitter) return baseDelay;

    // Add random jitter ±25%
    const jitterAmount = baseDelay * 0.25;
    const jitter = Math.random() * jitterAmount * 2 - jitterAmount;

    return Math.max(0, baseDelay + jitter);
  }

  /**
   * Wait with exponential backoff
   */
  async wait(attempt: number): Promise<void> {
    const delay = this.getDelay(attempt);
    logger.debug({ attempt, delay_ms: delay }, 'Backoff wait');
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    backoff?: BackoffStrategy;
    retryableErrors?: string[];
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    backoff = new BackoffStrategy(),
    retryableErrors = ['ScraperError', 'TimeoutError'],
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      const isLastAttempt = attempt === maxAttempts;
      const isRetryable = retryableErrors.includes(lastError.name);

      if (isLastAttempt || !isRetryable) {
        throw lastError;
      }

      logger.warn(
        { attempt, max_attempts: maxAttempts, error: lastError.message },
        'Operation failed, retrying...'
      );

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await backoff.wait(attempt);
    }
  }

  throw lastError!;
}
