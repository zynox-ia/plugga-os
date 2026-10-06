import {
  ContadorTentativas,
  type OpcoesDeContagem,
  type ResultadoContagem,
} from "./contador-tentativas";

interface Entrada {
  total: number;
  expiraEm: number;
}

/** Acima disto, uma varredura descarta as entradas já vencidas. */
const LIMITE_PARA_VARREDURA = 10_000;

/**
 * Contador em memória do processo. Serve a três casos: os testes (variante sem
 * Redis), `RATE_LIMIT_STORE=memory` e a QUEDA do Redis em execução, quando o
 * `RedisContadorTentativas` cai para cá (falha aberta: o limite deixa de ser
 * compartilhado, mas ninguém deixa de entrar por isso).
 */
export class MemoriaContadorTentativas extends ContadorTentativas {
  private readonly entradas = new Map<string, Entrada>();

  constructor(private readonly agora: () => number = Date.now) {
    super();
  }

  async incrementar(
    chave: string,
    ttlMs: number,
    opcoes: OpcoesDeContagem = {},
  ): Promise<ResultadoContagem> {
    const agora = this.agora();
    this.varrerSePreciso(agora);

    const atual = this.entradas.get(chave);
    if (!atual || atual.expiraEm <= agora) {
      const nova = { total: 1, expiraEm: agora + ttlMs };
      this.entradas.set(chave, nova);
      return { total: 1, ttlRestanteMs: ttlMs };
    }

    atual.total += 1;
    if (opcoes.renovarTtl) {
      atual.expiraEm = agora + ttlMs;
    }
    return { total: atual.total, ttlRestanteMs: atual.expiraEm - agora };
  }

  async apagar(chave: string): Promise<void> {
    this.entradas.delete(chave);
  }

  private varrerSePreciso(agora: number): void {
    if (this.entradas.size < LIMITE_PARA_VARREDURA) return;
    for (const [chave, entrada] of this.entradas) {
      if (entrada.expiraEm <= agora) this.entradas.delete(chave);
    }
  }
}
