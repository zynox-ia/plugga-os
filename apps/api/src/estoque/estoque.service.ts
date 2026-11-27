import { Inject, Injectable } from "@nestjs/common";
import {
  alcancaTela,
  buscarClientesDeCompraRespostaSchema,
  criarPedidoDeCompraSchema,
  itemDeEstoqueSchema,
  listarItensDeEstoqueRespostaSchema,
  listarMovimentacoesRespostaSchema,
  movimentacaoSchema,
  opcoesDeEstoqueRespostaSchema,
  pedidoDeReposicaoAbertoSchema,
  pedidosParaEntradaRespostaSchema,
  type AbrirPedidoDeReposicao,
  type BuscarClientesDeCompraQuery,
  type BuscarClientesDeCompraResposta,
  type CriarItemDeEstoque,
  type EditarItemDeEstoque,
  type ItemDeEstoque,
  type ListarItensDeEstoqueQuery,
  type ListarItensDeEstoqueResposta,
  type ListarMovimentacoesQuery,
  type ListarMovimentacoesResposta,
  type Movimentacao,
  type OpcoesDeEstoqueResposta,
  type PedidoDeReposicaoAberto,
  type PedidosParaEntradaResposta,
  type RegistrarMovimentacao,
} from "@plugga/shared";

import { AcessoNegado, EstadoInvalido, RequisicaoInvalida } from "../common/errors/dominio";
import { RELOGIO_DE_COMPRAS, type Relogio } from "../compras/compras.service";
import { PrismaComprasRepository } from "../compras/prisma-compras.repository";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { D } from "./estoque.rules";
import { PrismaEstoqueRepository } from "./prisma-estoque.repository";

/**
 * Estoque de Suprimentos (PLU-332). O controller exige a tela de Estoque; o
 * "Abrir pedido de compra" exige também a de Compras, porque cria um pedido.
 */
@Injectable()
export class EstoqueService {
  constructor(
    @Inject(PrismaEstoqueRepository) private readonly estoque: PrismaEstoqueRepository,
    @Inject(PrismaComprasRepository) private readonly compras: PrismaComprasRepository,
    @Inject(RELOGIO_DE_COMPRAS) private readonly agora: Relogio,
  ) {}

  async listar(query: ListarItensDeEstoqueQuery): Promise<ListarItensDeEstoqueResposta> {
    return listarItensDeEstoqueRespostaSchema.parse(await this.estoque.listar(query));
  }

  async obter(id: string): Promise<ItemDeEstoque> {
    return itemDeEstoqueSchema.parse(await this.estoque.obter(id, this.agora()));
  }

  async criar(input: CriarItemDeEstoque, principal: AuthPrincipal): Promise<ItemDeEstoque> {
    return this.obter(await this.estoque.criar(input, principal, this.agora()));
  }

  async editar(id: string, input: EditarItemDeEstoque, principal: AuthPrincipal): Promise<ItemDeEstoque> {
    await this.estoque.editar(id, input, principal);
    return this.obter(id);
  }

  async mudarSituacao(id: string, ativo: boolean, principal: AuthPrincipal): Promise<ItemDeEstoque> {
    await this.estoque.mudarSituacao(id, ativo, principal);
    return this.obter(id);
  }

  async registrarMovimentacao(input: RegistrarMovimentacao, principal: AuthPrincipal): Promise<Movimentacao> {
    const id = await this.estoque.registrarMovimentacao(input, principal, this.agora());
    return movimentacaoSchema.parse(await this.estoque.movimentacao(id));
  }

  async listarMovimentacoes(query: ListarMovimentacoesQuery): Promise<ListarMovimentacoesResposta> {
    return listarMovimentacoesRespostaSchema.parse(await this.estoque.listarMovimentacoes(query, this.agora()));
  }

  async opcoes(): Promise<OpcoesDeEstoqueResposta> {
    return opcoesDeEstoqueRespostaSchema.parse({ obras: await this.estoque.obras() });
  }

  async pedidosParaEntrada(id: string): Promise<PedidosParaEntradaResposta> {
    return pedidosParaEntradaRespostaSchema.parse({ itens: await this.estoque.pedidosParaEntrada(id) });
  }

  async buscarClientes(query: BuscarClientesDeCompraQuery): Promise<BuscarClientesDeCompraResposta> {
    return buscarClientesDeCompraRespostaSchema.parse({ itens: await this.estoque.buscarClientes(query.busca) });
  }

  /** Cria o pedido de reposição: empresa do item, destino interno, o item vinculado e o que falta para o mínimo. */
  async abrirPedido(id: string, input: AbrirPedidoDeReposicao, principal: AuthPrincipal): Promise<PedidoDeReposicaoAberto> {
    if (!alcancaTela(principal.acesso, "suprimentos.compras")) throw new AcessoNegado("Abrir pedido de compra exige também a tela de Compras.");
    const item = await this.estoque.paraReposicao(id);
    if (!item.ativo) throw new EstadoInvalido("O item de estoque está inativo.");
    const quantidade = input.quantidade ?? item.falta;
    if (!D(quantidade).gt(0)) {
      throw new RequisicaoInvalida("O item não está abaixo do mínimo: informe a quantidade a comprar.", [{ campo: "quantidade", problema: "Informe a quantidade." }]);
    }
    const pedido = criarPedidoDeCompraSchema.parse({
      empresa: item.empresa,
      titulo: `Reposição de estoque: ${item.codigo} · ${item.nome}`.slice(0, 200),
      destino: "interno",
      itens: [{ descricao: item.nome, quantidade: D(quantidade).toFixed(3).replace(/\.?0+$/, ""), unidade: item.unidade, itemDeEstoqueId: id }],
      prazoEntregaDesejado: input.prazoEntregaDesejado,
      responsavelId: input.responsavelId ?? null,
    });
    const pedidoId = await this.compras.criar(pedido, principal, this.agora());
    const { linha } = await this.compras.detalhe(pedidoId);
    return pedidoDeReposicaoAbertoSchema.parse({ pedidoId, numero: linha.numero });
  }
}
