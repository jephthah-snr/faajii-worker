import { createServer, Server } from 'node:http';
import { config } from '../config/env.js';
import { RedisStore } from '../core/redis-store.js';
import { RabbitTransport } from '../transport/rabbit.js';

export function startHealthServer(redis: RedisStore, rabbit: RabbitTransport): Server {
  return createServer(async (request, response) => {
    if (request.url !== '/health' && request.url !== '/ready') { response.writeHead(404).end(); return; }
    const [redisHealthy, rabbitHealthy] = await Promise.all([redis.health().catch(() => false), rabbit.health().catch(() => false)]);
    const healthy = redisHealthy && rabbitHealthy;
    response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ service: config.SERVICE_NAME, healthy, redis: redisHealthy, rabbitmq: rabbitHealthy, timezone: config.APP_TIMEZONE, now: new Date().toISOString() }));
  }).listen(config.PORT);
}
