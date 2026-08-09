# Faji Worker Service

Standalone scheduler and durable notification-delivery service for Faajii. It fetches eligible recipients from the backend, publishes one persistent RabbitMQ message per recipient/channel, and delivers email or SMS with Redis-backed idempotency.

## Delivery guarantees

- RabbitMQ queues, exchanges and messages are durable.
- Redis uses AOF in the supplied Compose stack.
- Every delivery ID is deterministic: `SHA-256(runId + recipientId + channel)`.
- A scheduler lock prevents multiple replicas from publishing the same run concurrently.
- An atomic Redis claim prevents multiple consumers from sending the same delivery concurrently.
- A sent checkpoint prevents resends when a run is restarted.
- Failed deliveries enter durable TTL retry queues with bounded attempts, then a DLQ.
- Provider success is checkpointed before the RabbitMQ message is acknowledged.
- Run counters record `published`, `sent`, `failedAttempts`, and `deadLettered`.

This provides **at-least-once queue processing with effectively-once application delivery**. No external email/SMS system can promise strict exactly-once delivery across a network failure after provider acceptance but before local checkpointing. For stronger protection, pass `deliveryId` as the provider idempotency key whenever the provider supports it and retain the backend delivery audit table permanently.

## Time handling

`APP_TIMEZONE` is the only scheduling timezone setting. Use an IANA identifier such as `Africa/Lagos`; never hard-code `UTC+1`. Cron expressions are interpreted in this zone, while stored instants and message timestamps remain ISO UTC. This avoids daylight-saving and offset arithmetic errors.

Example: `0 9 * * 1` with `APP_TIMEZONE=Africa/Lagos` always runs at 09:00 Lagos time.

## Backend contract

The worker calls each configured `recipientPath` with:

```text
GET {recipientPath}?runId=...&scheduledAt=...&cursor=...&limit=250
x-worker-api-key: ...
```

For digest jobs, the worker calculates the date window and fetches current event
data through `digestDataPath`. It merges the admin overrides, builds the email,
and persists the frozen result through `digestSnapshotPath` before requesting
recipients.

Expected response:

```json
{
  "data": {
    "recipients": [
      {
        "id": "42",
        "email": "person@example.com",
        "phone": "+2348012345678",
        "timezone": "Africa/Lagos",
        "templateData": {
          "firstName": "Ada",
          "event": { "title": "Faajii Night" }
        }
      }
    ],
    "nextCursor": null,
    "template": {
      "subject": "Reminder: {{ event.title }}",
      "html": "<p>Hello {{ firstName }}</p>",
      "text": "Hello {{ firstName }}"
    }
  }
}
```

After provider acceptance it posts an audit event to `POST /internal/worker/deliveries`. The backend should store `deliveryId` under a unique database constraint. Redis is the fast operational checkpoint; the backend table is the long-term audit record.

## Run locally

```bash
cp .env.example .env
# Set BACKEND_WORKER_API_KEY and edit JOBS_JSON
docker compose up --build
```

Health: `GET http://localhost:8090/health`  
RabbitMQ UI: `http://localhost:15672` (`guest` / `guest` locally)

## Trigger a job manually

Set `TOOLING_API_KEY`, then call the protected endpoint with a configured job
key. It returns `202 Accepted` immediately and runs the same runner used by cron
in the background. Watch worker logs for `Tooling job accepted`,
`Job recipient page published`, and `Tooling job completed`.

```bash
curl -X POST http://localhost:8090/v1/tooling/jobs/monday-digest/run \
  -H 'x-tooling-api-key: your-tooling-key' \
  -H 'content-type: application/json' \
  -d '{}'
```

To test a specific digest date, provide an ISO timestamp. The timestamp controls
the calculated digest window and creates a deterministic run ID.

```json
{ "scheduledAt": "2026-08-10T08:00:00.000Z" }
```

To rerun the same `scheduledAt` after a previous attempt, pass `"force": true`
(tooling only). That clears the scheduler lock, run counters, and per-delivery
Redis “already sent” markers so dry-run checkpoints do not block real sends.

```json
{ "scheduledAt": "2026-08-14T08:00:00.000Z", "force": true }
```

Keep `DRY_RUN=true` until backend recipient endpoints and credentials are verified.

## Production notes

- Use managed RabbitMQ and Redis with persistence, replication, TLS, authentication and backups.
- Run multiple consumer replicas, but only one scheduler is necessary; distributed locks make multiple schedulers safe.
- Alert on DLQ depth, oldest queued-message age, failure rate, missing scheduler heartbeats and provider quota.
- Keep prefetch/concurrency below provider rate limits. Start with 20 and tune using observed latency.
- Rotate the worker API key and provider credentials through a secret manager.
- Do not log email addresses, phone numbers, API keys, or message bodies.
