import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";

/**
 * Express `trust proxy` accepts several shapes; the environment only carries
 * strings. Booleans and hop counts are converted so `TRUST_PROXY=1` means "one
 * proxy hop" rather than the literal string "1" (which express would read as an
 * IP list and silently never match).
 */
export function resolveTrustProxy(raw: string): boolean | number | string {
  const value = raw.trim();
  if (value.toLowerCase() === "false") {
    return false;
  }
  if (value.toLowerCase() === "true") {
    return true;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

/**
 * Runtime configuration shared by the real bootstrap (`main.ts`) and the e2e
 * specs (ADR-0012). It lives here so a spec exercises the *production*
 * configuration instead of re-declaring its own — otherwise deleting a line
 * from `main.ts` leaves the suite green while the protection is gone.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const sessionSecret = config.getOrThrow<string>("AUTH_SESSION_SECRET");
  const trustProxy = resolveTrustProxy(config.get<string>("TRUST_PROXY", "loopback"));

  if (trustProxy === true) {
    new Logger("configureApp").warn(
      "TRUST_PROXY=true trusts any caller's X-Forwarded-For: per-IP rate limiting " +
        "and lockout can be bypassed by rotating the header. Use a hop count or CIDR.",
    );
  }

  // Decides what req.ip is, which is what the per-IP throttle buckets on.
  app.set("trust proxy", trustProxy);
  app.use(cookieParser(sessionSecret));
}
