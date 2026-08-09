import axios from "axios";
import { config } from "../config/env.js";
import { DigestRunData, RecipientPage } from "./types.js";

export class BackendClient {
  private readonly client = axios.create({
    baseURL: config.BACKEND_BASE_URL,
    timeout: config.HTTP_TIMEOUT_MS,
    headers: { "x-worker-api-key": config.BACKEND_WORKER_API_KEY },
  });

  async fetchRecipients(
    path: string,
    runId: string,
    scheduledAt: string,
    cursor?: string
  ): Promise<RecipientPage> {
    const response = await this.client.get(path, {
      params: { runId, scheduledAt, cursor, limit: config.RECIPIENT_PAGE_SIZE },
    });
    const body = response.data?.data ?? response.data;
    return {
      recipients: Array.isArray(body.recipients) ? body.recipients : [],
      nextCursor: body.nextCursor,
      template: body.template,
    };
  }

  async fetchDigestData(
    path: string,
    query: { targetDate: string; windowStart: string; windowEnd: string }
  ): Promise<DigestRunData> {
    const response = await this.client.get(path, { params: query });
    return response.data?.data ?? response.data;
  }

  async saveDigestSnapshot(
    path: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.client.post(path, payload);
  }

  async reportDelivery(payload: Record<string, unknown>): Promise<void> {
    await this.client.post("/internal/worker/deliveries", payload);
  }
}
