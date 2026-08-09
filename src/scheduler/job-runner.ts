import { DateTime } from 'luxon';
import { config } from '../config/env.js';
import { BackendClient } from '../core/backend-client.js';
import { createDeliveryId, createRunId } from '../core/identity.js';
import { logger } from '../core/logger.js';
import { RedisStore } from '../core/redis-store.js';
import { NotificationMessage } from '../core/types.js';
import { RabbitTransport } from '../transport/rabbit.js';

export class JobRunner {
  constructor(private readonly redis: RedisStore, private readonly rabbit: RabbitTransport, private readonly backend: BackendClient) {}

  async run(job: (typeof config.jobs)[number], scheduledInstant = new Date()): Promise<void> {
    const runId = createRunId(job.key, scheduledInstant);
    if (!(await this.redis.acquireSchedulerLock(job.key, runId, 3600))) { logger.info({ jobKey: job.key, runId }, 'Job run already owned by another scheduler'); return; }
    const scheduledAt = DateTime.fromJSDate(scheduledInstant, { zone: 'utc' }).setZone(config.APP_TIMEZONE).toISO()!;
    let cursor: string | undefined;
    let published = 0;
    do {
      const page = await this.backend.fetchRecipients(job.recipientPath, runId, scheduledAt, cursor);
      for (const recipient of page.recipients) {
        for (const channel of job.channels) {
          if (channel === 'email' && !recipient.email) continue;
          if (channel === 'sms' && !recipient.phone) continue;
          const message: NotificationMessage = { schemaVersion: 1, deliveryId: createDeliveryId(runId, recipient.id, channel), runId, jobKey: job.key, channel, recipient, template: page.template, scheduledAt, attempt: 0, createdAt: new Date().toISOString() };
          await this.rabbit.publish(message);
          published += 1;
          await this.redis.recordPublished(runId);
        }
      }
      cursor = page.nextCursor || undefined;
    } while (cursor);
    logger.info({ jobKey: job.key, runId, published, timezone: config.APP_TIMEZONE }, 'Job run published');
  }
}
