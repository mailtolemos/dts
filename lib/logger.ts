import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env().LOG_LEVEL,
  redact: {
    paths: [
      'apiKey',
      '*.apiKey',
      'headers.authorization',
      'env.GROQ_API_KEY',
      'env.PYTH_API_KEY',
      'env.CRYPTOPANIC_API_KEY',
      'env.FRED_API_KEY',
      'env.POLYGON_API_KEY',
      'env.COINGECKO_API_KEY',
    ],
    censor: '[REDACTED]',
  },
});
