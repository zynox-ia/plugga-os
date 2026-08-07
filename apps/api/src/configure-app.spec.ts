import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { describe, expect, it } from "vitest";

import { configureApp, resolveTrustProxy } from "./configure-app";

/** Captures what configureApp applies, without booting a real HTTP server. */
function fakeApp(environment: Record<string, unknown>) {
  const settings: Record<string, unknown> = {};
  const middleware: unknown[] = [];
  const config = {
    get: (key: string, defaultValue?: unknown): unknown =>
      key in environment ? environment[key] : defaultValue,
    getOrThrow: (key: string): unknown => {
      if (!(key in environment)) {
        throw new Error(`missing ${key}`);
      }
      return environment[key];
    },
  } as unknown as ConfigService;

  const app = {
    get: () => config,
    set: (key: string, value: unknown) => {
      settings[key] = value;
    },
    use: (value: unknown) => {
      middleware.push(value);
    },
  } as unknown as NestExpressApplication;

  return { app, settings, middleware };
}

const SECRET = { AUTH_SESSION_SECRET: "test_only_session_secret_change_me_please" };

describe("resolveTrustProxy", () => {
  it("keeps express keywords and CIDRs as strings", () => {
    expect(resolveTrustProxy("loopback")).toBe("loopback");
    expect(resolveTrustProxy("172.18.0.0/16")).toBe("172.18.0.0/16");
  });

  it("converts a hop count to a number", () => {
    // As a string, express would read "1" as an IP list and never match.
    expect(resolveTrustProxy("1")).toBe(1);
    expect(resolveTrustProxy("2")).toBe(2);
  });

  it("converts booleans", () => {
    expect(resolveTrustProxy("false")).toBe(false);
    expect(resolveTrustProxy("true")).toBe(true);
    expect(resolveTrustProxy("TRUE")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveTrustProxy("  loopback  ")).toBe("loopback");
    expect(resolveTrustProxy(" 1 ")).toBe(1);
  });
});

describe("configureApp", () => {
  it("defaults to trusting only the loopback hop", () => {
    const { app, settings } = fakeApp({ ...SECRET });

    configureApp(app);

    expect(settings["trust proxy"]).toBe("loopback");
  });

  it("applies TRUST_PROXY from the environment", () => {
    const { app, settings } = fakeApp({ ...SECRET, TRUST_PROXY: "1" });

    configureApp(app);

    // Containerized api/web: the peer is the Compose bridge, not loopback, so
    // the single web hop must be trusted for req.ip to be the real client.
    expect(settings["trust proxy"]).toBe(1);
  });

  it("can disable proxy trust entirely", () => {
    const { app, settings } = fakeApp({ ...SECRET, TRUST_PROXY: "false" });

    configureApp(app);

    expect(settings["trust proxy"]).toBe(false);
  });

  it("always installs signed cookie parsing", () => {
    const { app, middleware } = fakeApp({ ...SECRET });

    configureApp(app);

    expect(middleware).toHaveLength(1);
  });

  it("requires a session secret rather than signing cookies with nothing", () => {
    const { app } = fakeApp({});

    expect(() => configureApp(app)).toThrow(/AUTH_SESSION_SECRET/);
  });
});
