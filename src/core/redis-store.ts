import Redis from 'ioredis';
import { config } from '../config/env.js';

const CLAIM_SCRIPT = `
local sent = redis.call('GET', KEYS[1])
if sent == 'sent' then return 0 end
local acquired = redis.call('SET', KEYS[2], ARGV[1], 'NX', 'EX', ARGV[2])
if acquired then return 1 end
return 0`;

const COMPLETE_SCRIPT = `
local owner = redis.call('GET', KEYS[2])
if owner ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], 'sent', 'EX', ARGV[2])
redis.call('DEL', KEYS[2])
redis.call('HINCRBY', KEYS[3], 'sent', 1)
redis.call('HSET', KEYS[3], 'updatedAt', ARGV[3])
return 1`;

export class RedisStore {
  readonly client: Redis;
  constructor() {
    this.client = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  }

  private key(...parts: string[]) { return [config.REDIS_KEY_PREFIX, ...parts].join(':'); }

  async acquireSchedulerLock(jobKey: string, runId: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(this.key('schedule-lock', jobKey, runId), runId, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async claimDelivery(deliveryId: string, owner: string): Promise<boolean> {
    const result = await this.client.eval(
      CLAIM_SCRIPT,
      2,
      this.key('delivery', deliveryId),
      this.key('processing', deliveryId),
      owner,
      String(config.PROCESSING_LOCK_SECONDS),
    );
    return Number(result) === 1;
  }

  async completeDelivery(deliveryId: string, runId: string, owner: string): Promise<boolean> {
    const ttl = config.DELIVERY_RECORD_TTL_DAYS * 86400;
    const result = await this.client.eval(
      COMPLETE_SCRIPT,
      3,
      this.key('delivery', deliveryId),
      this.key('processing', deliveryId),
      this.key('run', runId),
      owner,
      String(ttl),
      new Date().toISOString(),
    );
    return Number(result) === 1;
  }

  async releaseDelivery(deliveryId: string, owner: string): Promise<void> {
    const key = this.key('processing', deliveryId);
    const release = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
    await this.client.eval(release, 1, key, owner);
  }

  async recordPublished(runId: string, count = 1): Promise<void> {
    const key = this.key('run', runId);
    await this.client.multi().hincrby(key, 'published', count).hset(key, 'updatedAt', new Date().toISOString()).expire(key, config.DELIVERY_RECORD_TTL_DAYS * 86400).exec();
  }

  async recordFailure(runId: string): Promise<void> {
    await this.client.hincrby(this.key('run', runId), 'failedAttempts', 1);
  }

  async recordDeadLetter(runId: string): Promise<void> {
    await this.client.hincrby(this.key('run', runId), 'deadLettered', 1);
  }

  async health(): Promise<boolean> { return (await this.client.ping()) === 'PONG'; }
  async close(): Promise<void> { await this.client.quit(); }
}
