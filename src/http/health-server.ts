import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { config } from "../config/env.js";
import { createRunId } from "../core/identity.js";
import { logger } from "../core/logger.js";
import { RedisStore } from "../core/redis-store.js";
import { JobRunner } from "../scheduler/job-runner.js";
import { RabbitTransport } from "../transport/rabbit.js";
import {
  getPosterTemplate,
  listPosterTemplates,
} from "../posters/poster-catalog.js";
import { PosterEventData, renderPoster } from "../posters/poster-renderer.js";

function describeError(error: unknown) {
  const err = error as {
    message?: string;
    code?: string;
    response?: { status?: number; data?: unknown };
    config?: { method?: string; baseURL?: string; url?: string };
  };
  return {
    error: err.message || "Unknown error",
    code: err.code,
    upstreamStatus: err.response?.status,
    upstreamUrl: err.config
      ? `${err.config.baseURL || ""}${err.config.url || ""}`
      : undefined,
    upstreamBody: err.response?.data,
  };
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage): boolean {
  const supplied = request.headers["x-tooling-api-key"];
  if (!config.TOOLING_API_KEY || typeof supplied !== "string") return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(config.TOOLING_API_KEY);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function backendAuthorized(request: IncomingMessage): boolean {
  const supplied = request.headers["x-worker-api-key"];
  if (!config.BACKEND_WORKER_API_KEY || typeof supplied !== "string")
    return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(config.BACKEND_WORKER_API_KEY);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function startHealthServer(
  redis: RedisStore,
  rabbit: RabbitTransport,
  runner: JobRunner,
): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://worker.local");
    if (url.pathname === "/health" || url.pathname === "/ready") {
      const [redisHealthy, rabbitHealthy] = await Promise.all([
        redis.health().catch(() => false),
        rabbit.health().catch(() => false),
      ]);
      const healthy = redisHealthy && rabbitHealthy;
      json(response, healthy ? 200 : 503, {
        service: config.SERVICE_NAME,
        healthy,
        redis: redisHealthy,
        rabbitmq: rabbitHealthy,
        timezone: config.APP_TIMEZONE,
        now: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/v1/poster-templates" && request.method === "GET") {
      const templates = listPosterTemplates(
        url.searchParams.get("category") || undefined,
      );
      json(response, 200, {
        templates: templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          backgroundUrl: template.backgroundUrl,
          sortOrder: template.sortOrder,
          canvas: template.canvas,
          fields: template.fields,
        })),
      });
      return;
    }

    if (
      url.pathname === "/v1/tooling/posters/render" ||
      url.pathname === "/v1/internal/posters/render"
    ) {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        json(response, 405, { message: "Method not allowed" });
        return;
      }
      const isInternal = url.pathname === "/v1/internal/posters/render";
      if (!(isInternal ? backendAuthorized(request) : authorized(request))) {
        json(response, 401, { message: "Invalid service API key" });
        return;
      }
      try {
        const body = await readJson(request);
        const template = getPosterTemplate(String(body.templateId || ""));
        if (!template) {
          json(response, 404, { message: "Poster template not found" });
          return;
        }
        const event = body.event as PosterEventData | undefined;
        if (!event?.eventName?.trim()) {
          json(response, 400, { message: "event.eventName is required" });
          return;
        }
        const preview = body.preview !== false;
        const image = await renderPoster(template, event, preview);
        const contentType =
          template.canvas.format === "jpeg" ? "image/jpeg" : "image/png";
        response.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": String(image.length),
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename="${template.id}.${template.canvas.format}"`,
        });
        response.end(image);
      } catch (error) {
        logger.error({ error }, "Poster render failed");
        json(response, 500, {
          message: "Poster render failed",
          ...describeError(error),
        });
      }
      return;
    }

    const match = url.pathname.match(/^\/v1\/tooling\/jobs\/([^/]+)\/run$/);
    if (!match) {
      json(response, 404, { message: "Not found" });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      json(response, 405, { message: "Method not allowed" });
      return;
    }
    if (!config.TOOLING_API_KEY) {
      json(response, 503, { message: "Tooling endpoint is disabled" });
      return;
    }
    if (!authorized(request)) {
      json(response, 401, { message: "Invalid tooling API key" });
      return;
    }

    const jobKey = decodeURIComponent(match[1]!);
    const job = config.jobs.find((candidate) => candidate.key === jobKey);
    if (!job) {
      json(response, 404, {
        message: "Unknown job",
        availableJobs: config.jobs.map((candidate) => candidate.key),
      });
      return;
    }

    try {
      const body = await readJson(request);
      const scheduledInstant = body.scheduledAt
        ? new Date(String(body.scheduledAt))
        : new Date();
      if (Number.isNaN(scheduledInstant.getTime())) {
        json(response, 400, { message: "scheduledAt must be an ISO date" });
        return;
      }
      const force = body.force === true;
      const runId = createRunId(job.key, scheduledInstant);
      logger.info(
        { jobKey, runId, force, scheduledAt: scheduledInstant.toISOString() },
        "Tooling job accepted",
      );
      void runner
        .run(job, scheduledInstant, { force })
        .then((result) => {
          logger.info(
            { jobKey, ...result },
            result.skipped
              ? "Tooling job skipped; run already owned"
              : "Tooling job completed",
          );
        })
        .catch((error) => {
          logger.error(
            { jobKey, runId, err: error, ...describeError(error) },
            "Tooling job run failed",
          );
        });
      json(response, 202, {
        message:
          "Job accepted; running in background. Watch worker logs for progress.",
        jobKey,
        runId,
        force,
        scheduledAt: scheduledInstant.toISOString(),
      });
    } catch (error) {
      logger.error({ error, jobKey }, "Tooling job accept failed");
      json(response, 500, {
        message: "Job accept failed",
        jobKey,
        ...describeError(error),
      });
    }
  }).listen(config.PORT);
}
