import type { ThrottlerStorage } from "@nestjs/throttler";

type RegistroDoThrottler = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

import type { ContadorTentativas } from "./contador-tentativas";

/**
 * Armazenamento do `@nestjs/throttler` sobre o `ContadorTentativas` (US11,
 * T112, SEC-006). Troca o Map em memória do pacote — que zerava a cada reinício
 * e não era compartilhado — pelo Redis, sem mudar nenhuma rota.
 *
 * Janela fixa: a validade é a do primeiro acerto, como no armazenamento
 * original. O bloqueio dura o resto da janela (`blockDuration` igual ao `ttl`,
 * que é o padrão do pacote e o que nenhuma rota daqui sobrescreve).
 */
export class ContadorThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly contador: ContadorTentativas) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<RegistroDoThrottler> {
    const { total, ttlRestanteMs } = await this.contador.incrementar(`throttle:${throttlerName}:${key}`, ttl);
    const segundosRestantes = Math.max(1, Math.ceil(ttlRestanteMs / 1000));
    const bloqueado = total > limit;
    return {
      totalHits: total,
      timeToExpire: segundosRestantes,
      isBlocked: bloqueado,
      timeToBlockExpire: bloqueado ? segundosRestantes : 0,
    };
  }
}
