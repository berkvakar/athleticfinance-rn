/**
 * Secure Logger Utility
 * 
 * Only logs in development mode to prevent sensitive data exposure in production.
 * Use this instead of console.log/error/warn throughout the app.
 */

const isDevelopment = __DEV__;

export const logger = {
  /**
   * Log general information (disabled in production)
   */
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log errors (always enabled, but sanitized in production)
   */
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    } else {
      // In production, only log error type without sensitive details
      console.error('[ERROR]', args[0]?.toString().split(':')[0] || 'An error occurred');
    }
  },

  /**
   * Log warnings (disabled in production)
   */
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log debug information (disabled in production)
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },

  /**
   * Sanitize sensitive data before logging
   */
  sanitize: (data: any): any => {
    if (!isDevelopment) return '[REDACTED]';
    return data;
  },

  /**
   * Log with sensitive data redaction
   */
  logSanitized: (message: string, sensitiveData?: any) => {
    if (isDevelopment) {
      console.log(message, sensitiveData);
    } else {
      console.log(message);
    }
  },
};

