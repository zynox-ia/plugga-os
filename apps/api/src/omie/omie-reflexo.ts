import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { companyKeys, type CompanyKey } from "@plugga/shared";

import type { ConectorDoFinanceiro } from "../financeiro/conectores-do-financeiro";
import type { FatoDoLancamento, ReflexoDoLancamento } from "../financeiro/reflexo-do-lancamento";
import { comOTituloAntes, enviosDoFato, type OperacaoNoOmie } from "./omie-envios.rules";

/** A empresa tem o OMIE conectado (par conferido e confirmado)? */
export type ConexaoDoOmieLigada = (tx: Prisma.TransactionClient, empresa: string) => Promise<boolean>;
export const CONEXAO_DO_OMIE_LIGADA = Symbol("CONEXAO_DO_OMIE_LIGADA");

const pelaConexaoConfirmada: ConexaoDoOmieLigada = async (tx, empresa) => {
  const [linha] = await tx.$queryRaw<{ ligado: boolean }[]>`SELECT plugga_security.omie_conectado(${empresa}::text) AS ligado`;
  return linha?.ligado === true;
};

/** O OMIE como conector do Financeiro, para a tela: por empresa, a conexão está confirmada? */
@Injectable()
export class OmieConectorDoFinanceiro implements ConectorDoFinanceiro {
  readonly chave = "omie";

  constructor(@Optional() @Inject(CONEXAO_DO_OMIE_LIGADA) private readonly ligada: ConexaoDoOmieLigada = pelaConexaoConfirmada) {}

  async conexoes(tx: Prisma.TransactionClient): Promise<Record<CompanyKey, boolean>> {
    const situacao = {} as Record<CompanyKey, boolean>;
    for (const empresa of companyKeys) situacao[empresa] = await this.ligada(tx, empresa);
    return situacao;
  }
}

/**
 * O conector do OMIE ouvindo o Financeiro (PLU-342): traduz o fato do lançamento em
 * pedidos no outbox `omie_envios`, na transação da mudança. Só grava se a empresa tem
 * o OMIE conectado; desligado, o Financeiro segue sem ele. Nada sai daqui: a fila
 * confere o modo antes de chamar o OMIE.
 */
@Injectable()
export class OmieReflexoDoLancamento implements ReflexoDoLancamento {
  constructor(@Optional() @Inject(CONEXAO_DO_OMIE_LIGADA) private readonly ligada: ConexaoDoOmieLigada = pelaConexaoConfirmada) {}

  async aoMudar(tx: Prisma.TransactionClient, fato: FatoDoLancamento): Promise<void> {
    if (fato.mudanca === "cancelado") {
      // Pela função do conector, para valer com o RLS de quem cancela (o pedido de compra
      // é cancelado em Compras, por quem pode não ter o Financeiro). Descarta o que está em
      // aberto, com o conector ligado ou não; e, se a conta já chegou ao OMIE ou está
      // saindo e a empresa está conectada (o banco confere), pede o cancelamento lá.
      await tx.$executeRaw`SELECT plugga_security.omie_reflexo_do_cancelamento(${fato.lancamentoId}::uuid)`;
      return;
    }
    const pedidas = enviosDoFato({ tipo: fato.tipo, etapa: fato.etapaAntes }, fato.mudanca, false);
    if (pedidas.length === 0 || !(await this.ligada(tx, fato.empresa))) return;
    const temTitulo = (await tx.omieEnvio.count({ where: { lancamentoId: fato.lancamentoId, operacao: "upsert" } })) > 0;
    await this.enfileirar(tx, fato, comOTituloAntes(pedidas, temTitulo));
  }

  /**
   * Um pedido em aberto da mesma operação (pendente ou com erro) volta ao início da fila
   * em vez de duplicar; o índice único do banco garante.
   */
  private async enfileirar(tx: Prisma.TransactionClient, fato: FatoDoLancamento, operacoes: readonly OperacaoNoOmie[]): Promise<void> {
    for (const operacao of operacoes) {
      const juntou = await tx.$executeRaw`
        UPDATE public.omie_envios SET estado = 'pendente', tentativas = 0, ultimo_erro = NULL, proxima_tentativa_em = now()
        WHERE lancamento_id = ${fato.lancamentoId}::uuid AND operacao = ${operacao}::public.omie_operacao AND estado IN ('pendente', 'erro')`;
      if (juntou === 0) await tx.omieEnvio.create({ data: { lancamentoId: fato.lancamentoId, companyId: fato.empresa, operacao, criadoPorId: fato.porId } });
    }
  }
}
