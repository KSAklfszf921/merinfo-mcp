/**
 * Structured logging with Pino
 * Based on allabolag logging patterns
 */

import pino from 'pino';
import { DEFAULT_CONFIG } from '../types.js';

const transport = process.env.NODE_ENV === 'development'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level: DEFAULT_CONFIG.log_level,
  transport,
});

export function logScrapingOperation(
  operation: string,
  org_number: string,
  cached: boolean,
  duration_ms?: number,
  error?: Error
) {
  const logData = {
    operation,
    org_number,
    cached,
    duration_ms,
    error: error?.message,
  };

  if (error) {
    logger.error(logData, `Scraping error: ${error.message}`);
  } else {
    logger.info(logData, `Scraping completed: ${org_number}`);
  }
}

export function logRateLimit(identifier: string, retry_after_ms: number) {
  logger.warn({ identifier, retry_after_ms }, 'Rate limit hit');
}

export function logCacheOperation(operation: string, key: string, hit: boolean) {
  logger.debug({ operation, key, hit }, `Cache ${operation}`);
}
