import axios from 'axios';
import { config } from '../config/env.js';
import { NotificationMessage } from '../core/types.js';
import { renderTemplate } from './template.js';
import { logger } from '../core/logger.js';

export class EmailProvider {
  async send(message: NotificationMessage): Promise<string> {
    if (!message.recipient.email) throw new Error('Recipient has no email address');
    const subject = renderTemplate(message.template.subject, message.recipient.templateData) || 'Faajii notification';
    const html = renderTemplate(message.template.html, message.recipient.templateData);
    const text = renderTemplate(message.template.text, message.recipient.templateData) || '';
    if (config.DRY_RUN) { logger.info({ deliveryId: message.deliveryId, channel: 'email', subject }, 'Dry-run email accepted'); return `dry-${message.deliveryId}`; }
    if (!config.MAIL_API_TOKEN) throw new Error('MAIL_API_TOKEN is not configured');
    const response = await axios.post(config.MAIL_API_URL, {
      from: { address: config.MAIL_FROM_ADDRESS, name: config.MAIL_FROM_NAME },
      to: [{ email_address: { address: message.recipient.email } }],
      subject,
      textbody: text,
      htmlbody: html || `<p>${text}</p>`,
    }, { headers: { Authorization: config.MAIL_API_TOKEN, 'Content-Type': 'application/json' }, timeout: config.HTTP_TIMEOUT_MS });
    return String(response.data?.request_id || response.headers['x-request-id'] || message.deliveryId);
  }
}
