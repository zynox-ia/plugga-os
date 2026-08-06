import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpBitrixReadClient } from "./http-bitrix-read.client";

const WEBHOOK_URL = "https://portal.example.com/rest/1/s3cr3t-webhook-token";

/**
 * A literal config stub, not a real ConfigService: ConfigService falls back to
 * process.env, which would make "no credential configured" depend on the host.
 */
function buildClient(url: string | null = WEBHOOK_URL) {
  const config = {
    get: (key: string): string | undefined =>
      key === "BITRIX_WEBHOOK_URL" && url !== null ? url : undefined,
  } as unknown as ConfigService;
  return new HttpBitrixReadClient(config);
}

/** Guarantees no unit test can reach the network, whatever the code does. */
function denyNetwork() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("network access is not allowed in unit tests"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpBitrixReadClient", () => {
  it("refuses a write method before issuing any request", async () => {
    const fetchSpy = denyNetwork();
    const client = buildClient();

    await expect(client.callList("crm.item.add", {}, 0)).rejects.toThrow(/read-only/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails when the credential is absent instead of calling Bitrix", async () => {
    const fetchSpy = denyNetwork();
    const client = buildClient(null);

    await expect(client.callList("crm.item.list", {}, 0)).rejects.toThrow(
      /BITRIX_WEBHOOK_URL is not configured/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts a read method to the webhook endpoint and maps the page", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: [{ id: 1 }], total: 60, next: 50 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = buildClient();

    const page = await client.callList("crm.item.list", { entityTypeId: 1032 }, 50);

    expect(page).toEqual({ result: [{ id: 1 }], total: 60, next: 50 });
    const [endpoint, init] = fetchSpy.mock.calls[0]!;
    expect(endpoint).toBe(`${WEBHOOK_URL}/crm.item.list.json`);
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({ entityTypeId: 1032, start: 50 });
  });

  it("never leaks the webhook token in error messages", async () => {
    const client = buildClient();
    const failures: unknown[] = [];

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNRESET"));
    failures.push(await client.callList("crm.item.list", {}, 0).catch((error) => error));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("nope", { status: 401 }),
    );
    failures.push(await client.callList("crm.item.list", {}, 0).catch((error) => error));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "INVALID_CREDENTIALS", error_description: WEBHOOK_URL }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    failures.push(await client.callList("crm.item.list", {}, 0).catch((error) => error));

    expect(failures).toHaveLength(3);
    for (const failure of failures) {
      const message = String((failure as Error).message);
      expect(message).not.toContain("s3cr3t-webhook-token");
      expect(message).not.toContain(WEBHOOK_URL);
    }
  });

  it("tolerates a malformed result by yielding an empty page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: { unexpected: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(buildClient().callList("crm.item.list", {}, 0)).resolves.toEqual({
      result: [],
      total: undefined,
      next: undefined,
    });
  });
});
