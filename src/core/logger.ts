import pino from 'pino';
import { config } from '../config/env.js';

export const logger = pino({
  name: config.SERVICE_NAME,
  level: config.LOG_LEVEL,
  redact: ['req.headers.authorization', '*.apiKey', '*.token', '*.email', '*.phone'],
});
