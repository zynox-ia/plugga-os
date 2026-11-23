import { Inject, Injectable } from "@nestjs/common";
import {
  lancamentoSchema,
  listarLancamentosRespostaSchema,
  opcoesDoFinanceiroSchema,
  quadroFinanceiroSchema,
  resumoDosLancamentosRespostaSchema,
  type AcaoDoLancamento,
  type CriarContaAPagar,
  type EditarLancamento,
  type Lancamento,
  type ListarLancamentosQuery,
  type ListarLancamentosResposta,
  type OpcoesDoFinanceiro,
  type QuadroFinanceiro,
  type QuadroFinanceiroQuery,
  type ResumoDosLancamentosQuery,
  type ResumoDosLancamentosResposta,
} from "@plugga/shared";

import { AcessoNegado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { papelNoFinanceiro, type PapelNoFinanceiro } from "./financeiro.rules";
import { PrismaFinanceiroRepository } from "./prisma-financeiro.repository";

export const RELOGIO_DO_FINANCEIRO = Symbol("RELOGIO_DO_FINANCEIRO");
export type Relogio = () => Date;

/** Lançamentos do Financeiro (PLU-336). O acesso por tipo sai do papel; o RLS confere de novo no banco. */
@Injectable()
export class FinanceiroService {
  constructor(
    @Inject(PrismaFinanceiroRepository) private readonly repositorio: PrismaFinanceiroRepository,
    @Inject(RELOGIO_DO_FINANCEIRO) private readonly agora: Relogio,
  ) {}

  async listar(query: ListarLancamentosQuery, principal: AuthPrincipal): Promise<ListarLancamentosResposta> {
    const papel = this.papel(principal);
    return listarLancamentosRespostaSchema.parse(await this.repositorio.listar(query, papel, this.agora()));
  }

  async quadro(query: QuadroFinanceiroQuery, principal: AuthPrincipal): Promise<QuadroFinanceiro> {
    const papel = this.papel(principal);
    return quadroFinanceiroSchema.parse(await this.repositorio.quadro(query, papel, this.agora()));
  }

  async resumo(query: ResumoDosLancamentosQuery, principal: AuthPrincipal): Promise<ResumoDosLancamentosResposta> {
    const papel = this.papel(principal);
    return resumoDosLancamentosRespostaSchema.parse({
      resumo: await this.repositorio.resumo(papel, query.empresa, this.agora()),
      alcance: { saidas: papel.saidas, entradas: papel.entradas },
    });
  }

  async obter(id: string, principal: AuthPrincipal): Promise<Lancamento> {
    const papel = this.papel(principal);
    return lancamentoSchema.parse(await this.repositorio.obter(id, papel, this.agora()));
  }

  async opcoes(): Promise<OpcoesDoFinanceiro> {
    return opcoesDoFinanceiroSchema.parse(await this.repositorio.opcoes());
  }

  async criarContaAPagar(input: CriarContaAPagar, principal: AuthPrincipal): Promise<Lancamento> {
    const papel = this.papel(principal);
    if (!papel.saidas) throw new AcessoNegado("Conta a pagar é de quem tem a tela Contas a pagar.");
    const id = await this.repositorio.criarContaAPagar(input, principal);
    return this.obter(id, principal);
  }

  async editar(id: string, input: EditarLancamento, principal: AuthPrincipal): Promise<Lancamento> {
    await this.repositorio.editar(id, input, principal, this.papel(principal));
    return this.obter(id, principal);
  }

  async executarAcao(id: string, acao: AcaoDoLancamento, principal: AuthPrincipal): Promise<Lancamento> {
    await this.repositorio.executarAcao(id, acao, principal, this.papel(principal), this.agora());
    return this.obter(id, principal);
  }

  private papel(principal: AuthPrincipal): PapelNoFinanceiro {
    return papelNoFinanceiro(principal.acesso);
  }
}
