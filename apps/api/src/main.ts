import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { JsonLogger } from "./logging/json-logger.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  const host = config.getOrThrow<string>("HOST");
  const port = config.getOrThrow<number>("PORT");
  const sessionSecret = config.getOrThrow<string>("AUTH_SESSION_SECRET");

  // API listens on 127.0.0.1 by default (see README) — the web app is the only
  // process that can reach it directly. Trusting only "loopback" for
  // X-Forwarded-For lets req.ip (used by ThrottlerGuard) reflect the real
  // client IP the web app forwards, without opening trust to arbitrary hops
  // (never `true`, which would trust any caller's self-reported chain).
  app.set("trust proxy", "loopback");
  app.use(cookieParser(sessionSecret));
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap();
