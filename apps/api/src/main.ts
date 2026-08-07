import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
import { JsonLogger } from "./logging/json-logger.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  const host = config.getOrThrow<string>("HOST");
  const port = config.getOrThrow<number>("PORT");

  // API listens on 127.0.0.1 by default (see README) — the web app is the only
  // process that can reach it directly. In a container the bind is no longer
  // what protects it: the Compose network and the absence of a published port
  // are (ADR-0012), which is why HOST is set to 0.0.0.0 there.
  // Cookie parsing and `trust proxy` live in configureApp so the e2e suite
  // exercises this exact configuration.
  configureApp(app);
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap();
