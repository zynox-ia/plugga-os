import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { FatoDoLancamento, ReflexoDoLancamento } from "../financeiro/reflexo-do-lancamento";
import { comOTituloAntes, enviosDoFato, type OperacaoNoOmie } from "./omie-envios.rules";

/** A empresa tem o OMIE conectado (par conferido e confirmado)? */
export type ConexaoDoOmieLigada = (tx: Prisma.TransactionClient, empresa: string) => Promise<boolean>;
export const CONEXAO_DO_OMIE_LIGADA = Symbol("CONEXAO_DO_OMIE_LIGADA");

const pelaConexaoConfirmada: ConexaoDoOmieLigada = async (tx, empresa) => {
  const [linha] = await tx.$queryRaw<{ ligado: boolean }[]>`SELECT plugga_security.omie_conectado(${empresa}::text) AS ligado`;
  return linha?.ligado === true;
};

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
    let chegouAoOmie = false;
    if (fato.mudanca === "cancelado") {
      // Cancelar só vai ao OMIE se a conta já chegou lá ou está saindo; o que ainda está
      // em aberto do lançamento cancelado é descartado, com o conector ligado ou não.
      chegouAoOmie = (await tx.omieEnvio.count({ where: { lancamentoId: fato.lancamentoId, operacao: "upsert", estado: { in: ["enviado", "enviando"] } } })) > 0;
      await tx.omieEnvio.updateMany({ where: { lancamentoId: fato.lancamentoId, estado: { in: ["pendente", "erro"] } }, data: { estado: "descartado" } });
    }
    const pedidas = enviosDoFato({ tipo: fato.tipo, etapa: fato.etapaAntes }, fato.mudanca, chegouAoOmie);
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
