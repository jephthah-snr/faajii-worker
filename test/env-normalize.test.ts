import { describe, expect, it } from 'vitest';
import { normalizeEnv } from '../src/config/normalize-env.js';

describe('normalizeEnv', () => {
  it('maps core-backend env names onto worker keys', () => {
    const normalized = normalizeEnv({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_USERNAME: 'default',
      REDIS_PASSWORD: 'secret',
      MAILER_SMTP_HOST: 'https://api.zeptomail.com/v1.1',
      MAILER_PASSWORD: 'mail-token',
      MAILER_FROM: '"Swaply" <no-reply@swaply.africa>',
      MAILER_FROM_NAME: 'Faajii',
      TERMII_BASE_URL: 'https://notice-api.opensi.co/api/v0.2.3/sms',
      TERMII_API_KEY: 'sms-key',
      TERMII_SENDER_ID: 'Faajii',
      DEFAULT_PHONE_COUNTRY_CODE: '229',
    });

    expect(normalized.REDIS_URL).toBe('redis://default:secret@127.0.0.1:6379');
    expect(normalized.MAIL_API_URL).toBe('https://api.zeptomail.com/v1.1/email');
    expect(normalized.MAIL_API_TOKEN).toBe('mail-token');
    expect(normalized.MAIL_FROM_ADDRESS).toBe('no-reply@swaply.africa');
    expect(normalized.MAIL_FROM_NAME).toBe('Faajii');
    expect(normalized.SMS_API_URL).toBe('https://notice-api.opensi.co/api/v0.2.3/sms');
    expect(normalized.SMS_API_KEY).toBe('sms-key');
    expect(normalized.SMS_SENDER_ID).toBe('Faajii');
    expect(normalized.SMS_ALLOWED_COUNTRY_CODES).toContain('229');
  });
});
