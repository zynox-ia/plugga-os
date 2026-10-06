import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import { baldesDeNegocio } from "../core/armazenamento/baldes";
import { HealthRepository } from "./health.repository";

export type ResultadoDaSonda = { ok: boolean; motivo?: string };
export type Prontidao = {
  status: "ready" | "not_ready";
  dependencias: Record<"banco" | "redis" | "armazenamento", ResultadoDaSonda>;
};

const PRAZO_POR_SONDA_MS = 2000;

async function comPrazo(sonda: () => Promise<void>): Promise<ResultadoDaSonda> {
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sonda(),
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error("tempo esgotado")), PRAZO_POR_SONDA_MS);
      }),
    ]);
    return { ok: true };
  } catch (erro) {
    // O motivo é só o tipo da falha: nada de endpoint, usuário ou senha na resposta.
    return { ok: false, motivo: erro instanceof Error && erro.message === "tempo esgotado" ? "tempo esgotado" : "indisponível" };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** Prontidão: o app só está pronto se o banco, o Redis e o armazenamento respondem (spec 002, T167). */
@Injectable()
export class HealthService {
  constructor(
    @Inject(HealthRepository) private readonly repositorio: HealthRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  protected async sondarBanco(): Promise<void> {
    await this.repositorio.pingBanco();
  }

  protected async sondarRedis(): Promise<void> {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) return;
    const cliente = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false });
    cliente.on("error", () => undefined);
    try {
      await cliente.connect();
      await cliente.ping();
    } finally {
      cliente.disconnect();
    }
  }

  protected async sondarArmazenamento(): Promise<void> {
    if (!process.env.STORAGE_ENDPOINT) return;
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const cliente = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
      },
    });
    try {
      await cliente.send(new HeadBucketCommand({ Bucket: baldesDeNegocio()[0]! }));
    } finally {
      cliente.destroy();
    }
  }

  async prontidao(): Promise<Prontidao> {
    const [banco, redis, armazenamento] = await Promise.all([
      comPrazo(() => this.sondarBanco()),
      comPrazo(() => this.sondarRedis()),
      comPrazo(() => this.sondarArmazenamento()),
    ]);
    const pronto = banco.ok && redis.ok && armazenamento.ok;
    return { status: pronto ? "ready" : "not_ready", dependencias: { banco, redis, armazenamento } };
  }
}
