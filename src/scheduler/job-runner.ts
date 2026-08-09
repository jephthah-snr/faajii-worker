import { DateTime } from "luxon";
import { config } from "../config/env.js";
import { BackendClient } from "../core/backend-client.js";
import { createDeliveryId, createRunId } from "../core/identity.js";
import { logger } from "../core/logger.js";
import { RedisStore } from "../core/redis-store.js";
import { NotificationMessage } from "../core/types.js";
import {
  buildDigestTemplate,
  calculateDigestWindow,
  curateDigestEvents,
} from "../digests/digest.js";
import { RabbitTransport } from "../transport/rabbit.js";

export class JobRunner {
  constructor(
    private readonly redis: RedisStore,
    private readonly rabbit: RabbitTransport,
    private readonly backend: BackendClient
  ) {}

  async run(
    job: (typeof config.jobs)[number],
    scheduledInstant = new Date()
  ): Promise<{ runId: string; published: number; skipped: boolean }> {
    const runId = createRunId(job.key, scheduledInstant);
    if (!(await this.redis.acquireSchedulerLock(job.key, runId, 3600))) {
      logger.info(
        { jobKey: job.key, runId },
        "Job run already owned by another scheduler"
      );
      return { runId, published: 0, skipped: true };
    }
    const scheduledAt = DateTime.fromJSDate(scheduledInstant, { zone: "utc" })
      .setZone(config.APP_TIMEZONE)
      .toISO()!;
    if (job.digestType) {
      if (!job.digestDataPath || !job.digestSnapshotPath)
        throw new Error(
          `Digest job ${job.key} requires digestDataPath and digestSnapshotPath`
        );
      const window = calculateDigestWindow(
        job.digestType,
        scheduledInstant,
        config.APP_TIMEZONE
      );
      const data = await this.backend.fetchDigestData(
        job.digestDataPath,
        window
      );
      const events = curateDigestEvents(data);
      const template = buildDigestTemplate({
        type: job.digestType,
        runId,
        publicUrl: config.APP_PUBLIC_URL,
        appStoreUrl: config.APP_STORE_URL,
        playStoreUrl: config.PLAY_STORE_URL,
        facebookUrl: config.FACEBOOK_URL,
        instagramUrl: config.INSTAGRAM_URL,
        tiktokUrl: config.TIKTOK_URL,
        subject: data.subject,
        headline: data.headline,
        events,
      });
      await this.backend.saveDigestSnapshot(job.digestSnapshotPath, {
        runId,
        ...window,
        events,
        template,
      });
      logger.info(
        { jobKey: job.key, runId, events: events.length, ...window },
        "Digest curated from current backend data and snapshotted"
      );
    }
    let cursor: string | undefined;
    let published = 0;
    let pageNumber = 0;
    do {
      pageNumber += 1;
      const page = await this.backend.fetchRecipients(
        job.recipientPath,
        runId,
        scheduledAt,
        cursor
      );
      let pagePublished = 0;
      for (const recipient of page.recipients) {
        for (const channel of job.channels) {
          if (channel === "email" && !recipient.email) continue;
          if (channel === "sms" && !recipient.phone) continue;
          const message: NotificationMessage = {
            schemaVersion: 1,
            deliveryId: createDeliveryId(runId, recipient.id, channel),
            runId,
            jobKey: job.key,
            channel,
            recipient,
            template: page.template,
            scheduledAt,
            attempt: 0,
            createdAt: new Date().toISOString(),
          };
          await this.rabbit.publish(message);
          published += 1;
          pagePublished += 1;
          await this.redis.recordPublished(runId);
        }
      }
      logger.info(
        {
          jobKey: job.key,
          runId,
          pageNumber,
          pageRecipients: page.recipients.length,
          pagePublished,
          published,
          hasMore: Boolean(page.nextCursor),
        },
        "Job recipient page published"
      );
      cursor = page.nextCursor || undefined;
    } while (cursor);
    logger.info(
      { jobKey: job.key, runId, published, pages: pageNumber, timezone: config.APP_TIMEZONE },
      "Job run published"
    );
    return { runId, published, skipped: false };
  }
}
