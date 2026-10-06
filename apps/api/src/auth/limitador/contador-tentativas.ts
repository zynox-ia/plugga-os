/**
 * Contador com validade, a primitiva de todos os limitadores de abuso (US11,
 * T112, SEC-006): tentativas de login por conta e por origem, e o throttler por
 * IP das rotas.
 *
 * É uma porta para que a lógica (atraso progressivo, janela, isolamento entre
 * contas) seja a mesma e testável sem Redis; o adaptador de produção é o
 * `RedisContadorTentativas`, que faz os contadores sobreviverem a reinício do
 * app e serem compartilhados entre processos.
 */
export interface ResultadoContagem {
  /** Valor do contador depois do incremento. */
  total: number;
  /** Quanto falta para o contador expirar, em ms. */
  ttlRestanteMs: number;
}

export interface OpcoesDeContagem {
  /**
   * `true`: cada incremento renova a validade (janela deslizante: o contador só
   * zera depois de `ttlMs` SEM novas falhas). `false` (padrão): a validade é
   * fixada no primeiro incremento (janela fixa, como o throttler por IP).
   */
  renovarTtl?: boolean;
}

export abstract class ContadorTentativas {
  abstract incrementar(
    chave: string,
    ttlMs: number,
    opcoes?: OpcoesDeContagem,
  ): Promise<ResultadoContagem>;

  abstract apagar(chave: string): Promise<void>;
}
