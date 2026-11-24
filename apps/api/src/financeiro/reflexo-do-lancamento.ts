import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { EtapaDeLancamento, TipoDeLancamento } from "@plugga/shared";

/**
 * O que mudou num lançamento, em termos do Financeiro. O núcleo avisa o fato; quem estiver
 * inscrito decide o que fazer com ele. Hoje ninguém se inscreve: a integração com o OMIE foi
 * extinta (decisão do André de 24/11/2026). A porta fica para os provedores de boleto e NF.
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
  | "cancelado"
  | "conciliado"
  | "desconciliado";

export type FatoDoLancamento = {
  lancamentoId: string;
  empresa: string;
  tipo: TipoDeLancamento;
  /** A etapa ANTES da mudança (na criação, a etapa com que nasce). */
  etapaAntes: EtapaDeLancamento;
  mudanca: MudancaDoLancamento;
  porId: string;
};

/** Quem ouve os fatos dos lançamentos (um provedor de boleto ou de NF, no futuro). */
export interface ReflexoDoLancamento {
  /** Roda na transação da mudança: o que ele grava entra junto ou não entra. */
  aoMudar(tx: Prisma.TransactionClient, fato: FatoDoLancamento): Promise<void>;
}

/**
 * Os inscritos. O Financeiro não conhece nenhum: cada um se inscreve ao subir (o módulo
 * dele importa o Financeiro, nunca o contrário). Sem inscrito, o Financeiro funciona inteiro.
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
