import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module";
import { JsonLogger } from "./logging/json-logger.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  const port = config.getOrThrow<number>("PORT");

  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
