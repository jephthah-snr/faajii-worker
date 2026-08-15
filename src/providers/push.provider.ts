import { config } from '../config/env.js';
import { BackendClient } from '../core/backend-client.js';
import { logger } from '../core/logger.js';
import { NotificationMessage } from '../core/types.js';
import { renderTemplate } from './template.js';

export class PushProvider {
  constructor(private readonly backend: BackendClient) {}

  async send(message: NotificationMessage): Promise<string> {
    if (!message.recipient.userId) throw new Error('Push recipient has no user ID');
    const title = renderTemplate(message.template.subject, message.recipient.templateData) || 'Event reminder';
    const body = renderTemplate(message.template.text, message.recipient.templateData) || '';
    if (config.DRY_RUN) {
      logger.info({ deliveryId: message.deliveryId, channel: 'push', title }, 'Dry-run push accepted');
      return `dry-${message.deliveryId}`;
    }
    return this.backend.sendReminderPush({
      userId: message.recipient.userId,
      eventId: message.recipient.templateData.eventId,
      title,
      message: body,
    });
  }
}
