import { Inject, Injectable, type LoggerService } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

@Injectable()
export class JsonLogger implements LoggerService {
  private readonly minimumLevel: LogLevel;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.minimumLevel = config.get<LogLevel>("LOG_LEVEL", "info");
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  private write(level: Exclude<LogLevel, "silent">, message: unknown, params: unknown[]): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const context = typeof params.at(-1) === "string" ? params.at(-1) : undefined;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: this.serialize(message),
    };
    const output = `${JSON.stringify(record)}\n`;

    if (level === "error" || level === "warn") {
      process.stderr.write(output);
      return;
    }

    process.stdout.write(output);
  }

  private isEnabled(level: Exclude<LogLevel, "silent">): boolean {
    const weights: Record<LogLevel, number> = {
      debug: 10,
      info: 20,
      warn: 30,
      error: 40,
      silent: Number.POSITIVE_INFINITY,
    };

    return weights[level] >= weights[this.minimumLevel];
  }

  private serialize(message: unknown): unknown {
    if (message instanceof Error) {
      return { name: message.name, message: message.message, stack: message.stack };
    }

    return message;
  }
}
