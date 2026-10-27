import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Operational logger. Sensitive fields are redacted so passwords, cookies and
 * provider keys never reach the logs (spec 15).
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.apiKey',
      '*.token',
    ],
    censor: '[redacted]',
  },
  transport: env.isProduction || env.isTest ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});
