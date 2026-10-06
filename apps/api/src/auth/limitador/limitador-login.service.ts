import { createHash } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ContadorTentativas } from "./contador-tentativas";

/** O contador de uma conta ou origem zera depois de uma hora SEM nova falha. */
const JANELA_MS = 60 * 60_000;

/**
 * Atraso, em ms, de quem acabou de errar pela `falhas`-ésima vez seguida.
 *
 * As primeiras `livres` falhas não esperam nada (erro de digitação é normal).
 * Depois o atraso dobra a cada falha, de `baseMs` até o teto `maxMs`:
 * com 5 livres, base de 500 ms e teto de 8 s => 0, 0, 0, 0, 0, 0,5 s, 1 s,
 * 2 s, 4 s, 8 s, 8 s...
 */
export function atrasoProgressivo(falhas: number, livres: number, baseMs: number, maxMs: number): number {
  if (falhas <= livres || baseMs <= 0) return 0;
  const excesso = Math.min(falhas - livres, 30);
  return Math.min(baseMs * 2 ** (excesso - 1), maxMs);
}

/**
 * Limitador de tentativas de login (US11, T112, SEC-006, SC-013).
 *
 * Duas chaves por falha: a CONTA (e-mail, em hash) e a ORIGEM real do cliente
 * (`req.ip`, que respeita o `trust proxy` do ADR-0012). Nenhuma das duas
 * RECUSA ninguém: o atraso é só de quem erra, aplicado DEPOIS de a senha ter
 * sido verificada. Quem informa a senha correta nunca espera e nunca é barrado,
 * não importa quantas falhas a conta ou a origem acumularam — era a falha do
 * limitador anterior, em que 30 erros de qualquer um bloqueavam a vítima.
 *
 * - O contador da conta zera quando o dono acerta a senha. O da origem NÃO:
 *   senão quem tem uma conta própria a usaria para zerar o contador entre
 *   chutes na conta dos outros.
 * - Conta inexistente conta igual a existente (não vira oráculo de existência).
 * - Os contadores vivem no Redis: sobrevivem a reinício do app (ver
 *   `ContadorTentativas`). Se o Redis cair, caem para a memória do processo.
 */
@Injectable()
export class LimitadorLogin {
  private readonly logger = new Logger(LimitadorLogin.name);
  private readonly livresConta: number;
  private readonly livresOrigem: number;
  private readonly baseMs: number;
  private readonly maxMs: number;

  constructor(
    @Inject(ContadorTentativas) private readonly contador: ContadorTentativas,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.livresConta = config.get<number>("LOGIN_FREE_ATTEMPTS_ACCOUNT", 5);
    this.livresOrigem = config.get<number>("LOGIN_FREE_ATTEMPTS_ORIGIN", 15);
    this.baseMs = config.get<number>("LOGIN_DELAY_BASE_MS", 500);
    this.maxMs = config.get<number>("LOGIN_DELAY_MAX_MS", 8_000);
  }

  /** Registra uma falha e devolve quanto a resposta dessa falha deve esperar. */
  async registrarFalha(email: string, ip: string | null | undefined): Promise<number> {
    try {
      const [conta, origem] = await Promise.all([
        this.contador.incrementar(this.chaveConta(email), JANELA_MS, { renovarTtl: true }),
        this.contador.incrementar(this.chaveOrigem(ip), JANELA_MS, { renovarTtl: true }),
      ]);
      return Math.max(
        atrasoProgressivo(conta.total, this.livresConta, this.baseMs, this.maxMs),
        atrasoProgressivo(origem.total, this.livresOrigem, this.baseMs, this.maxMs),
      );
    } catch (erro) {
      // Defesa em profundidade: o contador já falha aberto, mas o limitador
      // nunca pode transformar uma falha de infraestrutura em erro de login.
      this.logger.warn(`limitador de login falhou, sem atraso: ${erro instanceof Error ? erro.message : String(erro)}`);
      return 0;
    }
  }

  /** Registra a falha e espera o atraso devido. Chamada só no caminho de quem errou. */
  async penalizar(email: string, ip: string | null | undefined): Promise<void> {
    const atrasoMs = await this.registrarFalha(email, ip);
    if (atrasoMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, atrasoMs));
    }
  }

  /** O dono acertou a senha: o contador da CONTA zera (o da origem segue). */
  async registrarSucesso(email: string): Promise<void> {
    try {
      await this.contador.apagar(this.chaveConta(email));
    } catch (erro) {
      this.logger.warn(`limitador de login: falha ao zerar a conta: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  private chaveConta(email: string): string {
    const normalizado = email.trim().toLowerCase();
    return `login:conta:${createHash("sha256").update(normalizado).digest("hex")}`;
  }

  private chaveOrigem(ip: string | null | undefined): string {
    return `login:origem:${ip && ip.length > 0 ? ip : "desconhecida"}`;
  }
}
