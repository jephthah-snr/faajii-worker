import { createHash } from 'node:crypto';

export function utcBucket(instant: Date, granularity: 'day' | 'minute' = 'minute'): string {
  const iso = instant.toISOString();
  return granularity === 'day' ? iso.slice(0, 10) : iso.slice(0, 16);
}

export function createRunId(jobKey: string, scheduledInstant: Date): string {
  return `${jobKey}:${utcBucket(scheduledInstant)}`;
}

export function createDeliveryId(runId: string, recipientId: string, channel: string): string {
  return createHash('sha256').update(`${runId}|${recipientId}|${channel}`).digest('hex');
}
