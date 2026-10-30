import { Inject, Injectable, type LoggerService } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { requestIdAtual } from "../common/contexto-requisicao";

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

    // O Nest passa o contexto como último argumento texto; o que sobra (pilha,
    // objetos, outros parâmetros) vira `detalhes` em vez de ser descartado.
    const ultimo = params.at(-1);
    const context = typeof ultimo === "string" ? ultimo : undefined;
    const restantes = context === undefined ? params : params.slice(0, -1);
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context,
      requestId: requestIdAtual(),
      message: this.serialize(message),
    };
    if (restantes.length > 0) {
      record.detalhes = restantes.map((p) => this.serialize(p));
    }
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
