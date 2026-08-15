import { Cron } from 'croner';
import { DateTime } from 'luxon';
import { config } from '../config/env.js';
import { BackendClient } from '../core/backend-client.js';
import { logger } from '../core/logger.js';
import { JobRunner } from './job-runner.js';

export class EventReminderScheduler {
  private midnight?: Cron;
  private readonly reminders = new Map<string, Cron>();

  constructor(private readonly runner: JobRunner, private readonly backend: BackendClient) {}

  async start(): Promise<void> {
    if (!config.EVENT_REMINDERS_ENABLED) return;
    this.midnight = new Cron('0 0 * * *', { timezone: config.APP_TIMEZONE, protect: true }, () => void this.scheduleDay().catch(this.logFailure));
    await this.scheduleDay();
    logger.info({ timezone: config.APP_TIMEZONE }, 'Daily event reminder scheduler started');
  }

  async scheduleDay(now = new Date()): Promise<number> {
    const local = DateTime.fromJSDate(now).setZone(config.APP_TIMEZONE);
    const start = local.startOf('day');
    const end = start.plus({ days: 1 });
    const events = await this.backend.fetchReminderEvents({
      targetDate: start.toISODate()!,
      windowStart: start.toUTC().toISO()!,
      windowEnd: end.toUTC().toISO()!,
    });
    let scheduled = 0;
    for (const event of events) {
      const startAt = DateTime.fromISO(event.startDate, { setZone: true });
      if (!startAt.isValid || startAt.toMillis() <= now.getTime()) continue;
      const due = startAt.minus({ minutes: 30 });
      const key = `${event.id}:${startAt.toUTC().toISO()}`;
      if (this.reminders.has(key)) continue;
      if (due.toMillis() <= now.getTime()) {
        void this.runner.runEventReminder(event.id, due.toJSDate()).catch(this.logFailure);
      } else {
        const task = new Cron(due.toJSDate(), () => {
          this.reminders.delete(key);
          void this.runner.runEventReminder(event.id, due.toJSDate()).catch(this.logFailure);
        });
        this.reminders.set(key, task);
      }
      scheduled += 1;
    }
    logger.info({ targetDate: start.toISODate(), events: events.length, scheduled }, 'Daily event reminders prepared');
    return scheduled;
  }

  stop(): void {
    this.midnight?.stop();
    for (const reminder of this.reminders.values()) reminder.stop();
    this.reminders.clear();
  }

  private readonly logFailure = (error: unknown) => logger.error({ error }, 'Event reminder scheduling failed');
}
