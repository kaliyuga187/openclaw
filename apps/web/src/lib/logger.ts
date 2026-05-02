import pino from 'pino';
import { env } from './env';

// Redact common secret-ish keys before they hit transport.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: 'openclaw' },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'authorization',
      'cookie',
      '*.password',
      '*.token',
      '*.authorization',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'stripe.*',
      'secret',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
      : undefined,
});
