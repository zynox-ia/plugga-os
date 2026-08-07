import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { assertReadOnlyMethod } from "./bitrix.constants";
import {
  BitrixReadClient,
  type BitrixListParams,
  type BitrixListResponse,
} from "./bitrix-read.client";

/**
 * Bitrix REST read client over the inbound webhook (token embedded in the URL).
 * The webhook URL is a secret: it is never logged and never returned in errors —
 * only method names, status codes, and Bitrix error codes surface (ADR-0007).
 */
@Injectable()
export class HttpBitrixReadClient extends BitrixReadClient {
  private readonly logger = new Logger(HttpBitrixReadClient.name);
  private readonly webhookUrl?: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.webhookUrl = config.get<string>("BITRIX_WEBHOOK_URL");
  }

  async callList(
    method: string,
    params: BitrixListParams,
    start: number,
  ): Promise<BitrixListResponse> {
    assertReadOnlyMethod(method);
    if (!this.webhookUrl) {
      throw new Error("BITRIX_WEBHOOK_URL is not configured");
    }

    const endpoint = this.buildEndpoint(method);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...params, start }),
      });
    } catch {
      // Never include the endpoint/token in the message.
      throw new Error(`Bitrix read '${method}' failed: network error`);
    }

    if (!response.ok) {
      throw new Error(`Bitrix read '${method}' failed: status=${response.status}`);
    }

    const body = (await response.json()) as {
      result?: unknown;
      total?: number;
      next?: number;
      error?: string;
      error_description?: string;
    };

    if (body.error) {
      // Bitrix error code only; error_description can echo input, so it is dropped.
      throw new Error(`Bitrix read '${method}' rejected: ${body.error}`);
    }

    return {
      result: Array.isArray(body.result) ? body.result : [],
      total: body.total,
      next: body.next,
    };
  }

  private buildEndpoint(method: string): string {
    const base = this.webhookUrl!.endsWith("/") ? this.webhookUrl! : `${this.webhookUrl!}/`;
    return `${base}${method}.json`;
  }
}
