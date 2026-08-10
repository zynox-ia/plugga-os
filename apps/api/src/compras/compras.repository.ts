import type {
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

/** Um orçamento já gravado no armazenamento, pronto para virar linha. */
export type AnexoDeCotacao = { arquivoChave: string; arquivoNome: string };

export abstract class ComprasRepository {
  abstract listarPedidos(query: PedidoListaQuery): Promise<PedidoLista>;
  abstract pedido(id: string, companyId: string, principal: AuthPrincipal): Promise<PedidoDetalhe>;

  abstract criarPedido(
    input: CriarPedidoRequest,
    anexos: readonly AnexoDeCotacao[],
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract triagem(
    id: string,
    companyId: string,
    input: TriagemRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract decidirEstoque(
    id: string,
    companyId: string,
    input: DecisaoEstoqueRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract validarNecessidade(
    id: string,
    companyId: string,
    input: ValidarNecessidadeRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract selecionarCotacao(
    id: string,
    companyId: string,
    input: SelecionarCotacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract decidirAprovacao(
    id: string,
    companyId: string,
    input: DecisaoAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract registrarPagamento(
    id: string,
    companyId: string,
    input: RegistrarPagamentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract confirmarRecebimento(
    id: string,
    companyId: string,
    input: ConfirmarRecebimentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract renegociarPrazo(
    id: string,
    companyId: string,
    input: RenegociarPrazoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe>;

  abstract scorecard(query: PeriodoQuery): Promise<ScorecardCompras>;
  abstract diagnostico(query: PeriodoQuery): Promise<DiagnosticoCompras>;

  abstract listarFornecedores(companyId: string): Promise<FornecedorLista>;
  abstract criarFornecedor(input: CriarFornecedorRequest, principal: AuthPrincipal): Promise<Fornecedor>;
  abstract listarObras(companyId: string): Promise<ObraLista>;
  abstract criarObra(input: CriarObraRequest, principal: AuthPrincipal): Promise<Obra>;
}
