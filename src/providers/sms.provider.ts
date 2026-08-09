import axios from 'axios';
import { config } from '../config/env.js';
import { NotificationMessage } from '../core/types.js';
import { renderTemplate } from './template.js';
import { logger } from '../core/logger.js';

function normalizePhone(input: string): { countryCode: string; msisdn: string } {
  const digits = input.replace(/\D/g, '').replace(/^0/, '234');
  const countryCode = [...config.smsAllowedCountryCodes].sort((a, b) => b.length - a.length).find(prefix => digits.startsWith(prefix));
  if (!countryCode) throw new Error('Unsupported SMS country code');
  return { countryCode, msisdn: digits.slice(countryCode.length) };
}

export class SmsProvider {
  async send(message: NotificationMessage): Promise<string> {
    if (!message.recipient.phone) throw new Error('Recipient has no phone number');
    const { countryCode, msisdn } = normalizePhone(message.recipient.phone);
    const body = renderTemplate(message.template.text, message.recipient.templateData) || '';
    if (config.DRY_RUN) { logger.info({ deliveryId: message.deliveryId, channel: 'sms', countryCode }, 'Dry-run SMS accepted'); return `dry-${message.deliveryId}`; }
    if (!config.SMS_API_KEY) throw new Error('SMS_API_KEY is not configured');
    const response = await axios.post(config.SMS_API_URL, { contacts: [{ msisdn, country_code: countryCode }], body, sender: config.SMS_SENDER_ID }, { headers: { api_key: config.SMS_API_KEY, 'Content-Type': 'application/json' }, timeout: config.HTTP_TIMEOUT_MS });
    return String(response.data?.id || response.data?.request_id || message.deliveryId);
  }
}
