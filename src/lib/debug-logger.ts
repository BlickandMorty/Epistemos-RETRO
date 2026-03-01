/**
 * Environment-gated debug logger.
 *
 * In development: all log levels output to console with labels.
 * In production: only warn and error output (info/debug are silenced).
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  /** Debug-level: only in development. For verbose tracing. */
  debug: (label: string, ...args: unknown[]) => {
    if (isDev) console.debug(`[${label}]`, ...args);
  },

  /** Info-level: only in development. For general flow logging. */
  info: (label: string, ...args: unknown[]) => {
    if (isDev) console.log(`[${label}]`, ...args);
  },

  /** Warn-level: always outputs. For recoverable issues. */
  warn: (label: string, ...args: unknown[]) => {
    console.warn(`[${label}]`, ...args);
  },

  /** Error-level: always outputs. For failures that need attention. */
  error: (label: string, ...args: unknown[]) => {
    console.error(`[${label}]`, ...args);
  },
};
