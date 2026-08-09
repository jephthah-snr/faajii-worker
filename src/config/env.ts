import 'dotenv/config';
import { z } from 'zod';
import { normalizeEnv } from './normalize-env.js';

const jobSchema = z.object({
  key: z.string().min(1),
  cron: z.string().min(1),
  channels: z.array(z.enum(['email', 'sms'])).min(1),
  recipientPath: z.string().startsWith('/'),
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SERVICE_NAME: z.string().default('faji-worker-service'),
  PORT: z.coerce.number().int().positive().default(8090),
  LOG_LEVEL: z.string().default('info'),
  APP_TIMEZONE: z.string().default('Africa/Lagos'),
  BACKEND_BASE_URL: z.string().url(),
  BACKEND_WORKER_API_KEY: z.string().min(1),
  RECIPIENT_PAGE_SIZE: z.coerce.number().int().min(1).max(1000).default(250),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  REDIS_URL: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().default('faji-worker'),
  DELIVERY_RECORD_TTL_DAYS: z.coerce.number().int().positive().default(90),
  PROCESSING_LOCK_SECONDS: z.coerce.number().int().positive().default(300),
  RABBITMQ_URL: z.string().min(1),
  RABBITMQ_EXCHANGE: z.string().default('faji.notifications'),
  RABBITMQ_QUEUE: z.string().default('faji.notifications.deliver'),
  RABBITMQ_DLQ: z.string().default('faji.notifications.dead'),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(20),
  MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  RETRY_DELAYS_MS: z.string().default('5000,30000,120000,600000'),
  JOBS_JSON: z.string().default('[]'),
  MAIL_API_URL: z.string().url(),
  MAIL_API_TOKEN: z.string().default(''),
  MAIL_FROM_ADDRESS: z.string().email(),
  MAIL_FROM_NAME: z.string().default('Faajii'),
  SMS_API_URL: z.string().url(),
  SMS_API_KEY: z.string().default(''),
  SMS_SENDER_ID: z.string().default('Faajii'),
  SMS_ALLOWED_COUNTRY_CODES: z.string().default('234,229,225,221,228,227'),
  DRY_RUN: z.string().default('false').transform(value => value === 'true'),
});

const raw = schema.parse(normalizeEnv(process.env));
const jobs = z.array(jobSchema).parse(JSON.parse(raw.JOBS_JSON));

export const config = {
  ...raw,
  jobs,
  retryDelaysMs: raw.RETRY_DELAYS_MS.split(',').map(Number).filter(Number.isFinite),
  smsAllowedCountryCodes: new Set(raw.SMS_ALLOWED_COUNTRY_CODES.split(',').map(x => x.trim())),
} as const;

process.env.TZ = config.APP_TIMEZONE;
