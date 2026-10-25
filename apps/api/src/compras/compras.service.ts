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
import { inspecionarEnvios, lerEnvio } from "../common/upload/arquivos-enviados";
import { ArmazenamentoDeCotacoes, TIPOS_ACEITOS } from "./armazenamento-de-cotacoes";
import { ResponsavelDeComprasRepository } from "./responsavel-de-compras.repository";
import { ComprasRepository, type AnexoDeCotacao } from "./compras.repository";

/** Um orçamento chegando pela requisição multipart. */
export type ArquivoDeCotacao = {
  /** Temporário em disco, apagado ao fim da requisição. */
  path: string;
  originalname: string;
  mimetype: string;
};

/**
 * Orquestra o repositório e o armazenamento de cotações. Quem alcança cada
 * rota é decidido pelo `AcessoGuard` (`compras.permissions.ts`); a empresa do
 * pedido é etiqueta, não fronteira de acesso.
 */
@Injectable()
export class ComprasService {
  constructor(
    @Inject(ComprasRepository) private readonly repositorio: ComprasRepository,
    @Inject(ResponsavelDeComprasRepository) private readonly responsaveis: ResponsavelDeComprasRepository,
    @Inject(ArmazenamentoDeCotacoes) private readonly armazenamento: ArmazenamentoDeCotacoes,
  ) {}

  async listarPedidos(query: PedidoListaQuery): Promise<PedidoLista> {
    return this.repositorio.listarPedidos(query);
  }

  async pedido(id: string, companyId: CompanyKey, principal: AuthPrincipal): Promise<PedidoDetalhe> {
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

    await this.responsaveis.assertPodeSerResponsavel(input.responsavelId);

    // O tipo é conferido pelo conteúdo antes de guardar qualquer um: um arquivo
    // recusado não deixa os anteriores órfãos no balde.
    await inspecionarEnvios(arquivos, TIPOS_ACEITOS);

    const anexos: AnexoDeCotacao[] = [];
    for (const arquivo of arquivos) {
      const guardado = await this.armazenamento.guardar(
        await lerEnvio(arquivo),
        arquivo.mimetype,
        arquivo.originalname,
        input.companyId,
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
    return this.repositorio.triagem(id, companyId, input, principal);
  }

  async decidirEstoque(
    id: string,
    companyId: CompanyKey,
    input: DecisaoEstoqueRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.decidirEstoque(id, companyId, input, principal);
  }

  async validarNecessidade(
    id: string,
    companyId: CompanyKey,
    input: ValidarNecessidadeRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.validarNecessidade(id, companyId, input, principal);
  }

  async selecionarCotacao(
    id: string,
    companyId: CompanyKey,
    input: SelecionarCotacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.selecionarCotacao(id, companyId, input, principal);
  }

  async decidirAprovacao(
    id: string,
    companyId: CompanyKey,
    input: DecisaoAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.decidirAprovacao(id, companyId, input, principal);
  }

  async registrarPagamento(
    id: string,
    companyId: CompanyKey,
    input: RegistrarPagamentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.registrarPagamento(id, companyId, input, principal);
  }

  async confirmarRecebimento(
    id: string,
    companyId: CompanyKey,
    input: ConfirmarRecebimentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.confirmarRecebimento(id, companyId, input, principal);
  }

  async renegociarPrazo(
    id: string,
    companyId: CompanyKey,
    input: RenegociarPrazoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.repositorio.renegociarPrazo(id, companyId, input, principal);
  }

  async scorecard(query: PeriodoQuery): Promise<ScorecardCompras> {
    return this.repositorio.scorecard(query);
  }

  async diagnostico(query: PeriodoQuery): Promise<DiagnosticoCompras> {
    return this.repositorio.diagnostico(query);
  }

  async listarFornecedores(companyId: CompanyKey): Promise<FornecedorLista> {
    return this.repositorio.listarFornecedores(companyId);
  }

  async criarFornecedor(input: CriarFornecedorRequest, principal: AuthPrincipal): Promise<Fornecedor> {
    return this.repositorio.criarFornecedor(input, principal);
  }

  async listarObras(companyId: CompanyKey): Promise<ObraLista> {
    return this.repositorio.listarObras(companyId);
  }

  async criarObra(input: CriarObraRequest, principal: AuthPrincipal): Promise<Obra> {
    return this.repositorio.criarObra(input, principal);
  }
}
