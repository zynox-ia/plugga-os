import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { EtapaDeLancamento, TipoDeLancamento } from "@plugga/shared";

/**
 * O que mudou num lançamento, em termos do Financeiro (decisão do André de 24/11/2026:
 * o Plugga OS é o dono do financeiro; os sistemas de fora são conectores desligáveis).
 * O núcleo avisa o fato; cada conector decide o que fazer com ele.
 */
export type MudancaDoLancamento =
  | "criado"
  | "editado"
  | "aprovado"
  | "valor_corrigido"
  | "nf_registrada"
  | "boleto_registrado"
  | "enviado"
  | "cobranca_registrada"
  | "pago"
  | "recebido"
  | "cancelado";

export type FatoDoLancamento = {
  lancamentoId: string;
  empresa: string;
  tipo: TipoDeLancamento;
  /** A etapa ANTES da mudança (na criação, a etapa com que nasce). */
  etapaAntes: EtapaDeLancamento;
  mudanca: MudancaDoLancamento;
  porId: string;
};

/** Um conector que reflete os lançamentos para fora (o OMIE é um). */
export interface ReflexoDoLancamento {
  /** Roda na transação da mudança: o que ele grava entra junto ou não entra. */
  aoMudar(tx: Prisma.TransactionClient, fato: FatoDoLancamento): Promise<void>;
}

/**
 * Os conectores inscritos. O Financeiro não conhece nenhum: cada conector se inscreve
 * ao subir (o módulo dele importa o Financeiro, nunca o contrário). Sem conector
 * inscrito, ou com ele desligado, o Financeiro funciona inteiro.
 */
@Injectable()
export class ReflexosDoLancamento {
  private readonly conectores: ReflexoDoLancamento[] = [];

  inscrever(conector: ReflexoDoLancamento): void {
    this.conectores.push(conector);
  }

  async aoMudar(tx: Prisma.TransactionClient, fato: FatoDoLancamento): Promise<void> {
    for (const conector of this.conectores) await conector.aoMudar(tx, fato);
  }
}
