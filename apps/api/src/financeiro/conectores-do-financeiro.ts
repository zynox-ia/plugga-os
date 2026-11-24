import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CompanyKey, ConectoresDoFinanceiroNasOpcoes } from "@plugga/shared";

/**
 * Um sistema externo ligado ao Financeiro (o OMIE, por exemplo). O Plugga OS é o dono do
 * financeiro (decisão do André de 24/11/2026): o núcleo não conhece conector nenhum, só
 * pergunta a quem se inscreveu se está conectado em cada empresa, para a tela.
 */
export interface ConectorDoFinanceiro {
  readonly chave: keyof ConectoresDoFinanceiroNasOpcoes;
  /** Por empresa: a conexão está conferida e confirmada? */
  conexoes(tx: Prisma.TransactionClient): Promise<Record<CompanyKey, boolean>>;
}

/** Os conectores inscritos. Sem nenhum, as opções não trazem `conectores`. */
@Injectable()
export class ConectoresDoFinanceiro {
  private readonly conectores: ConectorDoFinanceiro[] = [];

  inscrever(conector: ConectorDoFinanceiro): void {
    if (!this.conectores.some((c) => c.chave === conector.chave)) this.conectores.push(conector);
  }

  async conexoes(tx: Prisma.TransactionClient): Promise<ConectoresDoFinanceiroNasOpcoes | undefined> {
    if (this.conectores.length === 0) return undefined;
    const situacao: ConectoresDoFinanceiroNasOpcoes = {};
    for (const c of this.conectores) situacao[c.chave] = await c.conexoes(tx);
    return situacao;
  }
}
