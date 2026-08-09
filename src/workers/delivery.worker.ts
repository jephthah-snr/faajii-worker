import { randomUUID } from 'node:crypto';
import { ConsumeMessage } from 'amqplib';
import { config } from '../config/env.js';
import { BackendClient } from '../core/backend-client.js';
import { logger } from '../core/logger.js';
import { RedisStore } from '../core/redis-store.js';
import { NotificationMessage } from '../core/types.js';
import { EmailProvider } from '../providers/email.provider.js';
import { SmsProvider } from '../providers/sms.provider.js';
import { RabbitTransport } from '../transport/rabbit.js';

export class DeliveryWorker {
  constructor(private readonly redis: RedisStore, private readonly rabbit: RabbitTransport, private readonly backend: BackendClient, private readonly email: EmailProvider, private readonly sms: SmsProvider) {}
  async start(): Promise<void> { await this.rabbit.consume((message, raw) => this.handle(message, raw)); }

  private async handle(message: NotificationMessage, raw: ConsumeMessage): Promise<void> {
    const owner = randomUUID();
    if (!(await this.redis.claimDelivery(message.deliveryId, owner))) { this.rabbit.ack(raw); return; }
    try {
      const providerId = message.channel === 'email' ? await this.email.send(message) : await this.sms.send(message);
      if (!(await this.redis.completeDelivery(message.deliveryId, message.runId, owner))) throw new Error('Delivery ownership expired before completion');
      await this.backend.reportDelivery({ deliveryId: message.deliveryId, runId: message.runId, jobKey: message.jobKey, channel: message.channel, recipientId: message.recipient.id, status: 'sent', providerId, sentAt: new Date().toISOString() }).catch(error => logger.warn({ error, deliveryId: message.deliveryId }, 'Backend delivery audit callback failed'));
      this.rabbit.ack(raw);
      logger.info({ deliveryId: message.deliveryId, runId: message.runId, channel: message.channel }, 'Notification delivered');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.redis.releaseDelivery(message.deliveryId, owner);
      await this.redis.recordFailure(message.runId);
      const next = { ...message, attempt: message.attempt + 1 };
      if (next.attempt >= config.MAX_DELIVERY_ATTEMPTS) { await this.rabbit.deadLetter(next, reason); await this.redis.recordDeadLetter(message.runId); }
      else { await this.rabbit.retry(next); }
      this.rabbit.ack(raw);
      logger.error({ deliveryId: message.deliveryId, attempt: next.attempt, reason }, next.attempt >= config.MAX_DELIVERY_ATTEMPTS ? 'Notification dead-lettered' : 'Notification scheduled for retry');
    }
  }
}
