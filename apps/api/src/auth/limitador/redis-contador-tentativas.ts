import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import {
  ContadorTentativas,
  type OpcoesDeContagem,
  type ResultadoContagem,
} from "./contador-tentativas";
import { MemoriaContadorTentativas } from "./memoria-contador-tentativas";

const PREFIXO_PADRAO = "abuso:v1:";
/** Depois de uma falha do Redis, quanto tempo se usa a memória antes de tentar de novo. */
const REABRIR_DEPOIS_MS = 5_000;

/**
 * INCR atômico com validade. `ARGV[2] == "1"` renova a validade a cada
 * incremento (janela deslizante); senão ela é fixada só no primeiro. Devolve
 * `{total, pttl}`.
 */
const SCRIPT_INCREMENTAR = `
local total = redis.call('INCR', KEYS[1])
if total == 1 or ARGV[2] == '1' then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local pttl = redis.call('PTTL', KEYS[1])
return {total, pttl}
`;

/**
 * Contadores de abuso no Redis (US11, T112, SEC-006): sobrevivem a reinício do
 * app e valem para todas as instâncias. Conexão própria e curta (falha rápido),
 * no mesmo molde do `RedisSessionCache`.
 *
 * Falha ABERTA: se o Redis não responde, o contador cai para a memória do
 * processo e o erro vira log. Um Redis fora do ar nunca pode virar "ninguém
 * consegue entrar" nem 500 no login. Um disjuntor evita pagar o tempo limite do
 * comando em toda requisição enquanto ele estiver fora.
 *
 * Só guarda números por chave com prefixo e validade: nenhuma chave contém dado
 * pessoal (o e-mail entra como hash, quem monta a chave é o chamador).
 */
export class RedisContadorTentativas extends ContadorTentativas implements OnModuleDestroy {
  private readonly logger = new Logger(RedisContadorTentativas.name);
  private readonly client: Redis;
  private readonly prefixo: string;
  private readonly reserva = new MemoriaContadorTentativas();
  private reabreEm = 0;

  constructor(redisUrl: string, opcoes: { prefixo?: string } = {}) {
    super();
    this.prefixo = opcoes.prefixo ?? PREFIXO_PADRAO;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      commandTimeout: 1_500,
    });
    // Sem listener de erro o ioredis derruba o processo no primeiro erro de conexão.
    this.client.on("error", (erro) => {
      this.logger.warn(`redis dos limitadores: erro de conexão: ${erro.message}`);
    });
  }

  async incrementar(
    chave: string,
    ttlMs: number,
    opcoes: OpcoesDeContagem = {},
  ): Promise<ResultadoContagem> {
    if (Date.now() >= this.reabreEm) {
      try {
        const resposta = (await this.client.eval(
          SCRIPT_INCREMENTAR,
          1,
          this.prefixo + chave,
          String(ttlMs),
          opcoes.renovarTtl ? "1" : "0",
        )) as [number, number];
        const [total, pttl] = resposta;
        return { total, ttlRestanteMs: pttl > 0 ? pttl : ttlMs };
      } catch (erro) {
        this.abrirDisjuntor(erro);
      }
    }
    return this.reserva.incrementar(chave, ttlMs, opcoes);
  }

  async apagar(chave: string): Promise<void> {
    // A reserva também: se o Redis voltou, não sobra contador velho em memória.
    await this.reserva.apagar(chave);
    if (Date.now() < this.reabreEm) return;
    try {
      await this.client.del(this.prefixo + chave);
    } catch (erro) {
      this.abrirDisjuntor(erro);
    }
  }

  /** Remove as chaves deste prefixo. Só para limpeza de teste, nunca chamada pelo app. */
  async apagarTudoDoPrefixo(): Promise<void> {
    let cursor = "0";
    do {
      const [proximo, chaves] = await this.client.scan(cursor, "MATCH", `${this.prefixo}*`, "COUNT", 200);
      cursor = proximo;
      if (chaves.length > 0) await this.client.del(...chaves);
    } while (cursor !== "0");
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch (erro) {
      this.logger.warn(`redis dos limitadores: falha ao fechar: ${this.mensagem(erro)}`);
    }
  }

  private abrirDisjuntor(erro: unknown): void {
    this.reabreEm = Date.now() + REABRIR_DEPOIS_MS;
    this.logger.warn(
      `redis dos limitadores indisponível, usando a memória do processo por ${REABRIR_DEPOIS_MS / 1000}s: ${this.mensagem(erro)}`,
    );
  }

  private mensagem(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
