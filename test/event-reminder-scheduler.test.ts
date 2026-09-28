import {afterEach, describe, expect, it, vi} from 'vitest';
const cron = vi.hoisted(() => ({tasks: [] as any[]}));
vi.mock('croner', () => ({Cron: class {
  stop = vi.fn();
  constructor(public schedule: unknown, optionsOrCallback: any, callback?: any) {
    cron.tasks.push({schedule, callback: callback || optionsOrCallback, stop: this.stop});
  }
}}));
vi.mock('../src/config/env.js', () => ({config: {EVENT_REMINDERS_ENABLED: true, APP_TIMEZONE: 'Africa/Lagos'}}));
vi.mock('../src/core/logger.js', () => ({logger: {info: vi.fn(), error: vi.fn()}}));
import {EventReminderScheduler} from '../src/scheduler/event-reminder.scheduler.js';
afterEach(() => {cron.tasks.length = 0; vi.useRealTimers();});
describe('reminder refresh', () => {
  it('discovers a first RSVP made at 10am and schedules 1:55pm for a 2:25pm event', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T00:00:00+01:00'));
    const backend = {fetchReminderEvents: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([{id: '1', startDate: '2026-09-28T14:25:00+01:00'}])};
    const runner = {runEventReminder: vi.fn().mockResolvedValue({})};
    const scheduler = new EventReminderScheduler(runner as any, backend as any);
    await scheduler.start();
    expect(cron.tasks[0].schedule).toBe('0 * * * *');
    vi.setSystemTime(new Date('2026-09-28T10:00:00+01:00'));
    await cron.tasks[0].callback();
    expect(cron.tasks[1].schedule).toEqual(new Date('2026-09-28T13:55:00+01:00'));
    await scheduler.scheduleDay();
    expect(cron.tasks).toHaveLength(2);
    cron.tasks[1].callback();
    expect(runner.runEventReminder).toHaveBeenCalledWith('1', new Date('2026-09-28T13:55:00+01:00'));
    await scheduler.scheduleDay();
    expect(cron.tasks).toHaveLength(2);
    scheduler.stop();
  });
  it('cancels the old timer when the event time changes', async () => {
    const backend = {fetchReminderEvents: vi.fn().mockResolvedValueOnce([{id: '1', startDate: '2026-09-28T14:25:00+01:00'}]).mockResolvedValueOnce([{id: '1', startDate: '2026-09-28T15:25:00+01:00'}])};
    const scheduler = new EventReminderScheduler({} as any, backend as any);
    const now = new Date('2026-09-28T10:00:00+01:00');
    await scheduler.scheduleDay(now); await scheduler.scheduleDay(now);
    expect(cron.tasks[0].stop).toHaveBeenCalled();
    expect(cron.tasks[1].schedule).toEqual(new Date('2026-09-28T14:55:00+01:00'));
    scheduler.stop();
  });
  it('includes next-day events whose reminders fall before midnight', async () => {
    const backend = {fetchReminderEvents: vi.fn().mockResolvedValue([{id: '1', startDate: '2026-09-29T00:15:00+01:00'}])};
    const scheduler = new EventReminderScheduler({} as any, backend as any);
    await scheduler.scheduleDay(new Date('2026-09-28T23:00:00+01:00'));
    expect(backend.fetchReminderEvents).toHaveBeenCalledWith(expect.objectContaining({windowEnd: '2026-09-28T23:30:00.000Z'}));
    expect(cron.tasks[0].schedule).toEqual(new Date('2026-09-28T23:45:00+01:00'));
    scheduler.stop();
  });
});
