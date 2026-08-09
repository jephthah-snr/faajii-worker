import { Cron } from 'croner';
import { config } from '../config/env.js';
import { logger } from '../core/logger.js';
import { JobRunner } from './job-runner.js';

export class Scheduler {
  private readonly tasks: Cron[] = [];
  constructor(private readonly runner: JobRunner) {}
  start(): void {
    for (const job of config.jobs) {
      this.tasks.push(new Cron(job.cron, { timezone: config.APP_TIMEZONE, protect: true }, () => void this.runner.run(job).catch(error => logger.error({ error, jobKey: job.key }, 'Scheduled job failed'))));
      logger.info({ jobKey: job.key, cron: job.cron, timezone: config.APP_TIMEZONE }, 'Scheduled job registered');
    }
  }
  stop(): void { for (const task of this.tasks) task.stop(); }
}
