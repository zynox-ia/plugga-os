import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { JsonLogger } from "./logging/json-logger.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  const host = config.getOrThrow<string>("HOST");
  const port = config.getOrThrow<number>("PORT");
  const sessionSecret = config.getOrThrow<string>("AUTH_SESSION_SECRET");

  app.use(cookieParser(sessionSecret));
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap();
