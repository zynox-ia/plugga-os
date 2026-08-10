import { Inject, Injectable } from "@nestjs/common";
import type {
  CompanyKey,
  ConfirmarRecebimentoRequest,
  CriarFornecedorRequest,
  CriarObraRequest,
  CriarPedidoRequest,
  DecisaoAprovacaoRequest,
  DecisaoEstoqueRequest,
  DiagnosticoCompras,
  Fornecedor,
  FornecedorLista,
  Obra,
  ObraLista,
  PedidoDetalhe,
  PedidoLista,
  PedidoListaQuery,
  PeriodoQuery,
  RegistrarPagamentoRequest,
  RenegociarPrazoRequest,
  ScorecardCompras,
  SelecionarCotacaoRequest,
  TriagemRequest,
  ValidarNecessidadeRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeCotacoes } from "./armazenamento-de-cotacoes";
import { ComprasEscopoRepository } from "./compras-escopo.repository";
import { ComprasRepository, type AnexoDeCotacao } from "./compras.repository";

/** Um orçamento chegando pela requisição multipart. */
export type ArquivoDeCotacao = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

/**
 * Orquestra escopo de empresa + repositório.
 *
 * **Toda** entrada passa por `assertAlcanca` antes de qualquer acesso a dado.
 * A empresa chega na requisição como pretensão do navegador; é aqui que ela
 * vira permissão provada, ou 403.
 */
@Injectable()
export class ComprasService {
  constructor(
    @Inject(ComprasRepository) private readonly repositorio: ComprasRepository,
    @Inject(ComprasEscopoRepository) private readonly escopo: ComprasEscopoRepository,
    @Inject(ArmazenamentoDeCotacoes) private readonly armazenamento: ArmazenamentoDeCotacoes,
  ) {}

  async listarPedidos(query: PedidoListaQuery, principal: AuthPrincipal): Promise<PedidoLista> {
    await this.escopo.assertAlcanca(principal.id, query.companyId);
    return this.repositorio.listarPedidos(query);
  }

  async pedido(id: string, companyId: CompanyKey, principal: AuthPrincipal): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.pedido(id, companyId, principal);
  }

  /**
   * Criação atômica: os orçamentos vão para o armazenamento **antes** da
   * transação, e uma falha ali derruba a criação inteira — o POP §2.1 exige o
   * anexo na geração, e um pedido sem ele chega na análise sem a evidência que
   * ela precisa examinar.
   *
   * Objetos órfãos no balde quando a transação seguinte falha são aceitáveis: a
   * chave é o hash do conteúdo, então reenviar sobrescreve em vez de duplicar.
   * O contrário — segurar uma transação de banco aberta durante upload de rede —
   * custaria bem mais caro.
   */
  async criarPedido(
    input: CriarPedidoRequest,
    arquivos: readonly ArquivoDeCotacao[],
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);

    // O responsável tem de alcançar a mesma empresa. É ele que carrega a
    // accountability do indicador 4.2 do POP: apontar alguém de outra empresa —
    // ou de fora do departamento — poria o backlog crítico no nome de quem não
    // tem como trabalhar o pedido, e o indicador individual viraria ficção.
    await this.escopo.assertAlcanca(input.responsavelId, input.companyId);

    const anexos: AnexoDeCotacao[] = [];
    for (const arquivo of arquivos) {
      const guardado = await this.armazenamento.guardar(
        arquivo.buffer,
        arquivo.mimetype,
        arquivo.originalname,
      );
      anexos.push({ arquivoChave: guardado.chave, arquivoNome: arquivo.originalname });
    }

    return this.repositorio.criarPedido(input, anexos, principal);
  }

  async triagem(
    id: string,
    companyId: CompanyKey,
    input: TriagemRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.triagem(id, companyId, input, principal);
  }

  async decidirEstoque(
    id: string,
    companyId: CompanyKey,
    input: DecisaoEstoqueRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.decidirEstoque(id, companyId, input, principal);
  }

  async validarNecessidade(
    id: string,
    companyId: CompanyKey,
    input: ValidarNecessidadeRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.validarNecessidade(id, companyId, input, principal);
  }

  async selecionarCotacao(
    id: string,
    companyId: CompanyKey,
    input: SelecionarCotacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.selecionarCotacao(id, companyId, input, principal);
  }

  async decidirAprovacao(
    id: string,
    companyId: CompanyKey,
    input: DecisaoAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.decidirAprovacao(id, companyId, input, principal);
  }

  async registrarPagamento(
    id: string,
    companyId: CompanyKey,
    input: RegistrarPagamentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.registrarPagamento(id, companyId, input, principal);
  }

  async confirmarRecebimento(
    id: string,
    companyId: CompanyKey,
    input: ConfirmarRecebimentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.confirmarRecebimento(id, companyId, input, principal);
  }

  async renegociarPrazo(
    id: string,
    companyId: CompanyKey,
    input: RenegociarPrazoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.renegociarPrazo(id, companyId, input, principal);
  }

  async scorecard(query: PeriodoQuery, principal: AuthPrincipal): Promise<ScorecardCompras> {
    await this.escopo.assertAlcanca(principal.id, query.companyId);
    return this.repositorio.scorecard(query);
  }

  async diagnostico(query: PeriodoQuery, principal: AuthPrincipal): Promise<DiagnosticoCompras> {
    await this.escopo.assertAlcanca(principal.id, query.companyId);
    return this.repositorio.diagnostico(query);
  }

  async listarFornecedores(companyId: CompanyKey, principal: AuthPrincipal): Promise<FornecedorLista> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.listarFornecedores(companyId);
  }

  async criarFornecedor(input: CriarFornecedorRequest, principal: AuthPrincipal): Promise<Fornecedor> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.criarFornecedor(input, principal);
  }

  async listarObras(companyId: CompanyKey, principal: AuthPrincipal): Promise<ObraLista> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.listarObras(companyId);
  }

  async criarObra(input: CriarObraRequest, principal: AuthPrincipal): Promise<Obra> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.criarObra(input, principal);
  }
}
