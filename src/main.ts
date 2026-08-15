import { config } from "./config/env.js";
import { BackendClient } from "./core/backend-client.js";
import { logger } from "./core/logger.js";
import { RedisStore } from "./core/redis-store.js";
import { startHealthServer } from "./http/health-server.js";
import { EmailProvider } from "./providers/email.provider.js";
import { SmsProvider } from "./providers/sms.provider.js";
import { JobRunner } from "./scheduler/job-runner.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { RabbitTransport } from "./transport/rabbit.js";
import { DeliveryWorker } from "./workers/delivery.worker.js";
import { PushProvider } from "./providers/push.provider.js";
import { EventReminderScheduler } from "./scheduler/event-reminder.scheduler.js";

async function main() {
  const redis = new RedisStore();
  const rabbit = new RabbitTransport();
  const backend = new BackendClient();
  await rabbit.connect();
  const worker = new DeliveryWorker(
    redis,
    rabbit,
    backend,
    new EmailProvider(),
    new SmsProvider(),
    new PushProvider(backend)
  );
  await worker.start();
  const runner = new JobRunner(redis, rabbit, backend);
  const scheduler = new Scheduler(runner);
  scheduler.start();
  const eventReminders = new EventReminderScheduler(runner, backend);
  try {
    await eventReminders.start();
  } catch (error) {
    logger.error(
      { error },
      "Event reminder scheduler failed to start; continuing without reminders"
    );
  }
  const healthServer = startHealthServer(redis, rabbit, runner);
  logger.info(
    {
      port: config.PORT,
      timezone: config.APP_TIMEZONE,
      jobs: config.jobs.map((job) => job.key),
      dryRun: config.DRY_RUN,
    },
    "Faji Worker Service started"
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");
    scheduler.stop();
    eventReminders.stop();
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
    await rabbit.close();
    await redis.close();
    logger.info("Graceful shutdown complete");
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.fatal({ error }, "Faji Worker Service failed to start");
  process.exitCode = 1;
});
