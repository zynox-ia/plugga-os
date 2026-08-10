import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType, Prisma } from "@prisma/client";
import {
  pedidoDetalheSchema,
  pedidoListaSchema,
  type CompanyKey,
  type ComprasEtapa,
  type ComprasEtapaMensurada,
  type ConfirmarRecebimentoRequest,
  type CriarFornecedorRequest,
  type CriarObraRequest,
  type CriarPedidoRequest,
  type DecisaoAprovacaoRequest,
  type DecisaoEstoqueRequest,
  type DiagnosticoCompras,
  type Fornecedor,
  type FornecedorLista,
  type Obra,
  type ObraLista,
  type PedidoDetalhe,
  type PedidoLista,
  type PedidoListaQuery,
  type PeriodoQuery,
  type RegistrarPagamentoRequest,
  type RenegociarPrazoRequest,
  type ScorecardCompras,
  type SelecionarCotacaoRequest,
  type TriagemRequest,
  type ValidarNecessidadeRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ComprasRepository, type AnexoDeCotacao } from "./compras.repository";
import {
  assertAlcada,
  assertAlcadaDePrazo,
  assertConfirmacaoDeRecebimento,
  assertEtapaAtual,
  assertPagamentoTemFaturado,
  assertPodeRenegociarPrazo,
  assertPodeSeguirParaAprovacao,
  assertSegregacao,
  assertTransicaoPermitida,
  acoesBloqueadas,
  tetoDeRenegociacao,
} from "./compras.rules";
import {
  assertividadeGlobal,
  assertividadesDeApoio,
  backlogCritico,
  cumprimentoSlaPorEtapa,
  indicadorCruzado,
} from "./indicadores/indicadores";
import { adicionaDiasUteis, prazoDaEtapa, situacaoDoPrazo } from "./sla/dias-uteis";

const pedidoInclude = {
  obra: { select: { id: true, nome: true } },
  client: { select: { id: true, name: true } },
  solicitante: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
  itens: { orderBy: { createdAt: "asc" as const } },
  cotacoes: {
    orderBy: { createdAt: "asc" as const },
    include: { fornecedor: { select: { id: true, nome: true } } },
  },
  etapas: { orderBy: { entrouEm: "asc" as const } },
};

type PedidoComRelacoes = Prisma.PedidoDeCompraGetPayload<{ include: typeof pedidoInclude }>;

function decimal(valor: Prisma.Decimal | null): string | null {
  return valor === null ? null : valor.toFixed(2);
}

@Injectable()
export class PrismaComprasRepository extends ComprasRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  // --- Leitura -----------------------------------------------------------

  async listarPedidos(query: PedidoListaQuery): Promise<PedidoLista> {
    const linhas = await this.prisma.pedidoDeCompra.findMany({
      where: {
        companyId: query.companyId,
        etapa: query.etapa,
        responsavelId: query.responsavelId,
      },
      include: pedidoInclude,
      orderBy: [{ etapa: "asc" }, { createdAt: "desc" }],
    });

    const agora = new Date();
    const resumos = linhas.map((linha) => this.resumo(linha, agora));
    const filtrados = query.situacaoPrazo
      ? resumos.filter((resumo) => resumo.situacaoPrazo === query.situacaoPrazo)
      : resumos;

    return pedidoListaSchema.parse({ items: filtrados });
  }

  async pedido(id: string, companyId: string, principal: AuthPrincipal): Promise<PedidoDetalhe> {
    const linha = await this.carregar(id, companyId);
    return this.detalhe(linha, principal);
  }

  /**
   * Busca sempre condicionada à empresa. Pedido de outra empresa responde 404 e
   * não 403: confirmar a existência de um recurso que a pessoa não pode ver já
   * é vazar informação sobre a outra empresa.
   */
  private async carregar(id: string, companyId: string): Promise<PedidoComRelacoes> {
    const linha = await this.prisma.pedidoDeCompra.findFirst({
      where: { id, companyId },
      include: pedidoInclude,
    });
    if (!linha) throw new NotFoundException("pedido de compra não encontrado");
    return linha;
  }

  private passagemAberta(linha: PedidoComRelacoes) {
    return linha.etapas.find((etapa) => etapa.saiuEm === null) ?? null;
  }

  private resumo(linha: PedidoComRelacoes, agora: Date) {
    const aberta = this.passagemAberta(linha);
    return {
      id: linha.id,
      companyId: linha.companyId as CompanyKey,
      numero: linha.numero,
      titulo: linha.titulo,
      etapa: linha.etapa as ComprasEtapa,
      origemAtendimento: linha.origemAtendimento,
      destino: linha.destino,
      obraId: linha.obraId,
      obraNome: linha.obra?.nome ?? null,
      clientId: linha.clientId,
      clientNome: linha.client?.name ?? null,
      solicitanteId: linha.solicitanteId,
      solicitanteNome: linha.solicitante.name,
      responsavelId: linha.responsavelId,
      responsavelNome: linha.responsavel?.name ?? null,
      prazoEntregaDesejado: linha.prazoEntregaDesejado.toISOString(),
      valorOrcado: linha.valorOrcado.toFixed(2),
      valorCotado: decimal(linha.valorCotado),
      valorFaturado: decimal(linha.valorFaturado),
      prazoEtapaEm: aberta ? aberta.prazoEm.toISOString() : null,
      situacaoPrazo: situacaoDoPrazo(aberta?.prazoEm ?? null, agora),
      concluidoEm: linha.concluidoEm ? linha.concluidoEm.toISOString() : null,
      createdAt: linha.createdAt.toISOString(),
      updatedAt: linha.updatedAt.toISOString(),
    };
  }

  private detalhe(linha: PedidoComRelacoes, principal: AuthPrincipal): PedidoDetalhe {
    return pedidoDetalheSchema.parse({
      ...this.resumo(linha, new Date()),
      necessidadeValidadaEm: linha.necessidadeValidadaEm?.toISOString() ?? null,
      cotacaoSelecionadaId: linha.cotacaoSelecionadaId,
      itens: linha.itens.map((item) => ({
        id: item.id,
        descricao: item.descricao,
        quantidade: item.quantidade.toFixed(3),
        unidade: item.unidade,
      })),
      cotacoes: linha.cotacoes.map((cotacao) => ({
        id: cotacao.id,
        fornecedorId: cotacao.fornecedorId,
        fornecedorNome: cotacao.fornecedor.nome,
        valor: cotacao.valor.toFixed(2),
        valorFrete: decimal(cotacao.valorFrete),
        prazoEntregaDias: cotacao.prazoEntregaDias,
        condicoesPagamento: cotacao.condicoesPagamento,
        arquivoNome: cotacao.arquivoNome,
        selecionada: cotacao.id === linha.cotacaoSelecionadaId,
        createdAt: cotacao.createdAt.toISOString(),
      })),
      etapas: linha.etapas.map((etapa) => ({
        id: etapa.id,
        etapa: etapa.etapa,
        entrouEm: etapa.entrouEm.toISOString(),
        prazoDiasUteis: etapa.prazoDiasUteis,
        prazoEm: etapa.prazoEm.toISOString(),
        saiuEm: etapa.saiuEm?.toISOString() ?? null,
        cumpriuPrazo: etapa.cumpriuPrazo,
        responsavelId: etapa.responsavelId,
        responsavelNome: null,
      })),
      acoesBloqueadas: acoesBloqueadas(
        {
          etapa: linha.etapa,
          solicitanteId: linha.solicitanteId,
          selecionouCotacaoId: linha.selecionouCotacaoId,
          aprovouId: linha.aprovouId,
          valorCotado: decimal(linha.valorCotado),
        },
        { id: principal.id, roles: principal.roles },
      ),
    });
  }

  // --- Movimentação ------------------------------------------------------

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "service" ? "system" : "user";
  }

  /**
   * Fecha a passagem aberta e marca se o prazo foi cumprido.
   *
   * Sempre antes de abrir a próxima: existe índice único parcial no banco
   * garantindo uma passagem aberta por pedido, e inverter a ordem faria a
   * transação inteira estourar — o que é o comportamento certo, mas a ordem
   * correta é esta.
   */
  private async fecharPassagem(
    tx: Prisma.TransactionClient,
    pedidoId: string,
    agora: Date,
  ): Promise<void> {
    const aberta = await tx.pedidoDeCompraEtapa.findFirst({
      where: { pedidoId, saiuEm: null },
    });
    if (!aberta) return;
    await tx.pedidoDeCompraEtapa.update({
      where: { id: aberta.id },
      data: { saiuEm: agora, cumpriuPrazo: agora <= aberta.prazoEm },
    });
  }

  private async abrirPassagem(
    tx: Prisma.TransactionClient,
    entrada: {
      pedidoId: string;
      etapa: ComprasEtapaMensurada;
      agora: Date;
      responsavelId: string | null;
      origemAtendimento?: "estoque" | "aquisicao" | null;
      prazoFornecedorDias?: number | null;
    },
  ): Promise<void> {
    const { prazoDiasUteis, prazoEm } = prazoDaEtapa({
      etapa: entrada.etapa,
      entrouEm: entrada.agora,
      origemAtendimento: entrada.origemAtendimento,
      prazoFornecedorDias: entrada.prazoFornecedorDias,
    });
    await tx.pedidoDeCompraEtapa.create({
      data: {
        pedidoId: entrada.pedidoId,
        etapa: entrada.etapa,
        entrouEm: entrada.agora,
        prazoDiasUteis,
        prazoEm,
        responsavelId: entrada.responsavelId,
      },
    });
  }

  private async registrarEvento(
    tx: Prisma.TransactionClient,
    entrada: {
      nome: string;
      pedidoId: string;
      principal: AuthPrincipal;
      payload: Prisma.InputJsonValue;
      agora: Date;
    },
  ): Promise<void> {
    await tx.eventLog.create({
      data: {
        eventName: entrada.nome,
        entityType: "pedido_de_compra",
        entityId: entrada.pedidoId,
        actorType: this.actorType(entrada.principal),
        actorId: entrada.principal.id,
        payload: entrada.payload,
        occurredAt: entrada.agora,
      },
    });
  }

  /**
   * Move o pedido de etapa, condicionando o update à etapa de origem **e** à
   * empresa. Duas movimentações simultâneas passariam ambas pelo guard fora da
   * transação; recondicionar aqui é o que fecha a corrida, e o rollback leva o
   * evento junto. Mesmo mecanismo do módulo `commercial`.
   */
  private async moverEtapa(
    tx: Prisma.TransactionClient,
    entrada: {
      pedido: PedidoComRelacoes;
      para: ComprasEtapa;
      agora: Date;
      dados?: Prisma.PedidoDeCompraUncheckedUpdateManyInput;
    },
  ): Promise<void> {
    const resultado = await tx.pedidoDeCompra.updateMany({
      where: {
        id: entrada.pedido.id,
        companyId: entrada.pedido.companyId,
        etapa: entrada.pedido.etapa,
      },
      data: { ...entrada.dados, etapa: entrada.para },
    });
    if (resultado.count === 0) {
      throw new BadRequestException("o pedido mudou de etapa enquanto esta ação era processada");
    }
  }

  // --- Criação atômica ---------------------------------------------------

  async criarPedido(
    input: CriarPedidoRequest,
    anexos: readonly AnexoDeCotacao[],
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    if (anexos.length !== input.cotacoes.length) {
      throw new BadRequestException("cada cotação precisa do arquivo do orçamento correspondente");
    }

    await this.validarVinculos(input);

    const agora = new Date();
    const criado = await this.prisma.$transaction(async (tx) => {
      // Numeração por empresa dentro da transação. O índice único
      // (company_id, numero) é a rede: duas criações simultâneas fazem a
      // segunda falhar e repetir, em vez de gerar dois pedidos com o mesmo nº.
      const maior = await tx.pedidoDeCompra.aggregate({
        where: { companyId: input.companyId },
        _max: { numero: true },
      });

      const pedido = await tx.pedidoDeCompra.create({
        data: {
          companyId: input.companyId,
          numero: (maior._max.numero ?? 0) + 1,
          titulo: input.titulo,
          destino: input.destino,
          obraId: input.obraId ?? null,
          clientId: input.clientId ?? null,
          solicitanteId: principal.id,
          responsavelId: input.responsavelId,
          prazoEntregaDesejado: new Date(input.prazoEntregaDesejado),
          valorOrcado: input.valorOrcado,
          itens: { create: input.itens.map((item) => ({ ...item, unidade: item.unidade ?? null })) },
          cotacoes: {
            create: input.cotacoes.map((cotacao, indice) => {
              const anexo = anexos[indice];
              if (!anexo) throw new BadRequestException("orçamento faltando para uma das cotações");
              return {
                fornecedorId: cotacao.fornecedorId,
                valor: cotacao.valor,
                valorFrete: cotacao.valorFrete ?? null,
                prazoEntregaDias: cotacao.prazoEntregaDias ?? null,
                condicoesPagamento: cotacao.condicoesPagamento ?? null,
                arquivoChave: anexo.arquivoChave,
                arquivoNome: anexo.arquivoNome,
              };
            }),
          },
        },
      });

      await this.abrirPassagem(tx, {
        pedidoId: pedido.id,
        etapa: "pedido_gerado",
        agora,
        responsavelId: input.responsavelId,
      });

      await this.registrarEvento(tx, {
        nome: "compras.pedido_criado",
        pedidoId: pedido.id,
        principal,
        agora,
        payload: {
          companyId: input.companyId,
          numero: pedido.numero,
          itens: input.itens.length,
          cotacoes: input.cotacoes.length,
          valorOrcado: input.valorOrcado,
        },
      });

      return pedido;
    });

    return this.pedido(criado.id, input.companyId, principal);
  }

  /** Obra, cliente e fornecedores têm de ser da mesma empresa do pedido. */
  private async validarVinculos(input: CriarPedidoRequest): Promise<void> {
    if (input.obraId) {
      const obra = await this.prisma.obra.findFirst({
        where: { id: input.obraId, companyId: input.companyId },
        select: { id: true },
      });
      if (!obra) throw new BadRequestException("obra não encontrada nesta empresa");
    }

    const fornecedores = [...new Set(input.cotacoes.map((cotacao) => cotacao.fornecedorId))];
    const encontrados = await this.prisma.fornecedor.count({
      where: { id: { in: fornecedores }, companyId: input.companyId },
    });
    if (encontrados !== fornecedores.length) {
      throw new BadRequestException("cotação com fornecedor de outra empresa ou inexistente");
    }

    const responsavel = await this.prisma.user.findUnique({
      where: { id: input.responsavelId },
      select: { id: true },
    });
    if (!responsavel) throw new NotFoundException("responsável de compras não encontrado");
  }

  // --- Transições --------------------------------------------------------

  async triagem(
    id: string,
    companyId: string,
    input: TriagemRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "pedido_gerado");
    assertTransicaoPermitida(pedido.etapa, "analise_estoque");
    const responsavelId = input.responsavelId ?? pedido.responsavelId;
    if (!responsavelId) {
      throw new BadRequestException("a triagem exige um responsável de compras");
    }

    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, id, agora);
      await this.moverEtapa(tx, { pedido, para: "analise_estoque", agora, dados: { responsavelId } });
      await this.abrirPassagem(tx, { pedidoId: id, etapa: "analise_estoque", agora, responsavelId });
      await this.registrarEvento(tx, {
        nome: "compras.etapa_movida",
        pedidoId: id,
        principal,
        agora,
        payload: { de: pedido.etapa, para: "analise_estoque" },
      });
    });

    return this.pedido(id, companyId, principal);
  }

  async decidirEstoque(
    id: string,
    companyId: string,
    input: DecisaoEstoqueRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "analise_estoque");
    const para: ComprasEtapa = input.possuiEmEstoque ? "retirada" : "cotacoes";
    assertTransicaoPermitida(pedido.etapa, para);

    const origemAtendimento = input.possuiEmEstoque ? "estoque" : "aquisicao";
    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, id, agora);
      await this.moverEtapa(tx, { pedido, para, agora, dados: { origemAtendimento } });
      await this.abrirPassagem(tx, {
        pedidoId: id,
        etapa: para as ComprasEtapaMensurada,
        agora,
        responsavelId: pedido.responsavelId,
        origemAtendimento,
      });
      await this.registrarEvento(tx, {
        nome: "compras.estoque_decidido",
        pedidoId: id,
        principal,
        agora,
        payload: { possuiEmEstoque: input.possuiEmEstoque, observacao: input.observacao ?? null },
      });
    });

    return this.pedido(id, companyId, principal);
  }

  async validarNecessidade(
    id: string,
    companyId: string,
    input: ValidarNecessidadeRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    if (pedido.etapa !== "cotacoes") {
      throw new BadRequestException("a necessidade é validada na etapa de cotações");
    }

    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.pedidoDeCompra.updateMany({
        where: { id, companyId, etapa: "cotacoes" },
        data: { necessidadeValidadaEm: agora },
      });
      await this.registrarEvento(tx, {
        nome: "compras.necessidade_validada",
        pedidoId: id,
        principal,
        agora,
        payload: { observacao: input.observacao ?? null },
      });
    });

    return this.pedido(id, companyId, principal);
  }

  async selecionarCotacao(
    id: string,
    companyId: string,
    input: SelecionarCotacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "cotacoes");
    assertTransicaoPermitida(pedido.etapa, "aprovacao_compra");

    const cotacao = pedido.cotacoes.find((linha) => linha.id === input.cotacaoId);
    if (!cotacao) throw new NotFoundException("cotação não encontrada neste pedido");

    assertPodeSeguirParaAprovacao({
      necessidadeValidadaEm: pedido.necessidadeValidadaEm,
      cotacaoSelecionadaId: input.cotacaoId,
    });

    // Cotado é o custo total da proposta escolhida, frete incluído: comparar
    // propostas pelo valor da mercadoria sozinha esconde justamente a diferença
    // que costuma decidir a escolha.
    const total = cotacao.valor.add(cotacao.valorFrete ?? 0);
    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, id, agora);
      await this.moverEtapa(tx, {
        pedido,
        para: "aprovacao_compra",
        agora,
        dados: {
          cotacaoSelecionadaId: input.cotacaoId,
          selecionouCotacaoId: principal.id,
          valorCotado: total,
        },
      });
      await this.abrirPassagem(tx, {
        pedidoId: id,
        etapa: "aprovacao_compra",
        agora,
        responsavelId: pedido.responsavelId,
      });
      await this.registrarEvento(tx, {
        nome: "compras.cotacao_selecionada",
        pedidoId: id,
        principal,
        agora,
        payload: {
          cotacaoId: input.cotacaoId,
          fornecedorId: cotacao.fornecedorId,
          valorCotado: total.toFixed(2),
        },
      });
    });

    return this.pedido(id, companyId, principal);
  }

  async decidirAprovacao(
    id: string,
    companyId: string,
    input: DecisaoAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "aprovacao_compra");
    const para: ComprasEtapa = input.aprovada ? "pagamento" : "cotacoes";
    assertTransicaoPermitida(pedido.etapa, para);

    assertAlcada(decimal(pedido.valorCotado), principal.roles);
    const segregacao = assertSegregacao(
      "aprovar",
      {
        solicitanteId: pedido.solicitanteId,
        selecionouCotacaoId: pedido.selecionouCotacaoId,
        aprovouId: pedido.aprovouId,
      },
      { id: principal.id, roles: principal.roles },
      input.dispensaSegregacao,
    );

    const destino = await this.resolverDestinoNaAprovacao(pedido, input);
    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, id, agora);
      await this.moverEtapa(tx, {
        pedido,
        para,
        agora,
        dados: input.aprovada
          ? { ...destino, aprovouId: principal.id }
          : // REVISAR limpa a seleção: a cotação que voltou foi recusada, e
            // deixá-la marcada faria a próxima ida à aprovação carregar a
            // escolha que acabou de ser rejeitada.
            { ...destino, cotacaoSelecionadaId: null, selecionouCotacaoId: null, valorCotado: null },
      });
      await this.abrirPassagem(tx, {
        pedidoId: id,
        etapa: para as ComprasEtapaMensurada,
        agora,
        responsavelId: pedido.responsavelId,
      });
      await this.registrarEvento(tx, {
        nome: input.aprovada ? "compras.compra_aprovada" : "compras.compra_em_revisao",
        pedidoId: id,
        principal,
        agora,
        payload: {
          motivo: input.motivo ?? null,
          valorCotado: decimal(pedido.valorCotado),
          cotacaoRecusadaId: input.aprovada ? null : pedido.cotacaoSelecionadaId,
        },
      });
      if (segregacao.dispensada) {
        await this.registrarDispensa(tx, id, principal, agora, "aprovar", segregacao.pares, input.dispensaSegregacao);
      }
    });

    return this.pedido(id, companyId, principal);
  }

  /**
   * O POP §1 dá à Gestão Financeira a vinculação de Obra/Cliente, não só a
   * aprovação de pagamento. Corrigir o destino no ato evita devolver o pedido
   * ao solicitante só porque o vínculo veio errado.
   */
  private async resolverDestinoNaAprovacao(
    pedido: PedidoComRelacoes,
    input: DecisaoAprovacaoRequest,
  ): Promise<Prisma.PedidoDeCompraUncheckedUpdateManyInput> {
    if (!input.destino) return {};

    const obraId = input.obraId ?? null;
    const clientId = input.clientId ?? null;
    if (input.destino === "obra" && !obraId) {
      throw new BadRequestException("destino obra exige a obra vinculada");
    }
    if (input.destino === "cliente" && !clientId) {
      throw new BadRequestException("destino cliente exige o cliente vinculado");
    }
    if (obraId) {
      const obra = await this.prisma.obra.findFirst({
        where: { id: obraId, companyId: pedido.companyId },
        select: { id: true },
      });
      if (!obra) throw new BadRequestException("obra não encontrada nesta empresa");
    }

    return {
      destino: input.destino,
      obraId: input.destino === "obra" ? obraId : null,
      clientId: input.destino === "cliente" ? clientId : null,
    };
  }

  async registrarPagamento(
    id: string,
    companyId: string,
    input: RegistrarPagamentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "pagamento");
    assertTransicaoPermitida(pedido.etapa, "retirada");
    assertPagamentoTemFaturado(input.valorFaturado);

    const segregacao = assertSegregacao(
      "pagar",
      {
        solicitanteId: pedido.solicitanteId,
        selecionouCotacaoId: pedido.selecionouCotacaoId,
        aprovouId: pedido.aprovouId,
      },
      { id: principal.id, roles: principal.roles },
      input.dispensaSegregacao,
    );

    const cotacao = pedido.cotacoes.find((linha) => linha.id === pedido.cotacaoSelecionadaId);
    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, id, agora);
      await this.moverEtapa(tx, {
        pedido,
        para: "retirada",
        agora,
        dados: { valorFaturado: input.valorFaturado },
      });
      await this.abrirPassagem(tx, {
        pedidoId: id,
        etapa: "retirada",
        agora,
        responsavelId: pedido.responsavelId,
        origemAtendimento: pedido.origemAtendimento,
        prazoFornecedorDias: cotacao?.prazoEntregaDias ?? null,
      });
      await this.registrarEvento(tx, {
        nome: "compras.pagamento_registrado",
        pedidoId: id,
        principal,
        agora,
        payload: { valorFaturado: input.valorFaturado, observacao: input.observacao ?? null },
      });
      if (segregacao.dispensada) {
        await this.registrarDispensa(tx, id, principal, agora, "pagar", segregacao.pares, input.dispensaSegregacao);
      }
    });

    return this.pedido(id, companyId, principal);
  }

  async confirmarRecebimento(
    id: string,
    companyId: string,
    input: ConfirmarRecebimentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "retirada");
    assertTransicaoPermitida(pedido.etapa, "concluido");

    const confirmacao = assertConfirmacaoDeRecebimento(
      { solicitanteId: pedido.solicitanteId },
      { id: principal.id, roles: principal.roles },
      input.confirmacaoPorTerceiro,
    );

    const segregacao = assertSegregacao(
      "receber",
      {
        solicitanteId: pedido.solicitanteId,
        selecionouCotacaoId: pedido.selecionouCotacaoId,
        aprovouId: pedido.aprovouId,
      },
      { id: principal.id, roles: principal.roles },
      input.dispensaSegregacao,
    );

    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, id, agora);
      // Terminal não abre passagem: `concluido` não tem SLA no POP §3, e uma
      // linha com prazo inventado entraria no indicador 4.3 como se tivesse.
      await this.moverEtapa(tx, { pedido, para: "concluido", agora, dados: { concluidoEm: agora } });
      await this.registrarEvento(tx, {
        nome: "compras.recebimento_confirmado",
        pedidoId: id,
        principal,
        agora,
        payload: {
          observacao: input.observacao ?? null,
          porTerceiro: confirmacao.porTerceiro,
          justificativaDoTerceiro: confirmacao.porTerceiro
            ? (input.confirmacaoPorTerceiro ?? null)
            : null,
        },
      });
      if (segregacao.dispensada) {
        await this.registrarDispensa(tx, id, principal, agora, "receber", segregacao.pares, input.dispensaSegregacao);
      }
    });

    return this.pedido(id, companyId, principal);
  }

  async renegociarPrazo(
    id: string,
    companyId: string,
    input: RenegociarPrazoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = await this.carregar(id, companyId);
    const aberta = this.passagemAberta(pedido);
    const agora = new Date();
    assertPodeRenegociarPrazo(aberta?.prazoEm ?? null, agora);
    const passagem = aberta as NonNullable<typeof aberta>;

    // Esticar além da régua do POP §3 é alçada da diretoria: quem é medido pelo
    // 4.3 não move o próprio vencimento sem alguém de fora olhar.
    const cotacaoEscolhida = pedido.cotacoes.find((linha) => linha.id === pedido.cotacaoSelecionadaId);
    assertAlcadaDePrazo(
      input.prazoDiasUteis,
      tetoDeRenegociacao(
        passagem.etapa as ComprasEtapaMensurada,
        pedido.origemAtendimento,
        cotacaoEscolhida?.prazoEntregaDias ?? null,
      ),
      principal.roles,
    );

    // O prazo renegociado é contado da entrada na etapa, não de agora: mover a
    // origem da contagem apagaria o tempo já consumido e faria uma etapa
    // renegociada parecer mais rápida do que foi no indicador 4.3.
    const prazoEm = adicionaDiasUteis(passagem.entrouEm, input.prazoDiasUteis);

    await this.prisma.$transaction(async (tx) => {
      await tx.pedidoDeCompraEtapa.update({
        where: { id: passagem.id },
        data: { prazoDiasUteis: input.prazoDiasUteis, prazoEm },
      });
      await this.registrarEvento(tx, {
        nome: "compras.prazo_renegociado",
        pedidoId: id,
        principal,
        agora,
        payload: {
          etapa: passagem.etapa,
          de: passagem.prazoDiasUteis,
          para: input.prazoDiasUteis,
          motivo: input.motivo,
        },
      });
    });

    return this.pedido(id, companyId, principal);
  }

  private async registrarDispensa(
    tx: Prisma.TransactionClient,
    pedidoId: string,
    principal: AuthPrincipal,
    agora: Date,
    acao: string,
    pares: readonly string[],
    justificativa: string | undefined,
  ): Promise<void> {
    await this.registrarEvento(tx, {
      nome: "compras.segregacao_dispensada",
      pedidoId,
      principal,
      agora,
      payload: { acao, pares: [...pares], justificativa: justificativa ?? null },
    });
  }

  // --- Indicadores -------------------------------------------------------

  async scorecard(query: PeriodoQuery): Promise<ScorecardCompras> {
    const de = new Date(query.de);
    const ate = new Date(query.ate);

    const pedidos = await this.prisma.pedidoDeCompra.findMany({
      where: { companyId: query.companyId },
      include: {
        responsavel: { select: { id: true, name: true } },
        etapas: true,
      },
    });

    const passagens = pedidos.flatMap((pedido) => pedido.etapas);

    const dispensas = await this.prisma.eventLog.count({
      where: {
        eventName: "compras.segregacao_dispensada",
        entityId: { in: pedidos.map((pedido) => pedido.id) },
        occurredAt: { gte: de, lte: ate },
      },
    });

    return {
      companyId: query.companyId,
      de: query.de,
      ate: query.ate,
      assertividadeGlobal: assertividadeGlobal(
        pedidos.map((pedido) => ({
          valorOrcado: pedido.valorOrcado.toFixed(2),
          valorCotado: decimal(pedido.valorCotado),
          valorFaturado: decimal(pedido.valorFaturado),
          origemAtendimento: pedido.origemAtendimento,
          concluidoEm: pedido.concluidoEm,
        })),
        { de, ate },
      ),
      backlogCritico: backlogCritico(
        pedidos.map((pedido) => ({
          responsavelId: pedido.responsavelId,
          responsavelNome: pedido.responsavel?.name ?? null,
          createdAt: pedido.createdAt,
          concluidoEm: pedido.concluidoEm,
          passagens: pedido.etapas,
        })),
        { de, ate },
      ),
      cumprimentoSla: cumprimentoSlaPorEtapa(passagens, { de, ate }),
      dispensasDeSegregacao: dispensas,
    };
  }

  async diagnostico(query: PeriodoQuery): Promise<DiagnosticoCompras> {
    const de = new Date(query.de);
    const ate = new Date(query.ate);

    const pedidos = await this.prisma.pedidoDeCompra.findMany({
      where: { companyId: query.companyId },
      include: { etapas: true },
    });

    const paraAssertividade = pedidos.map((pedido) => ({
      valorOrcado: pedido.valorOrcado.toFixed(2),
      valorCotado: decimal(pedido.valorCotado),
      valorFaturado: decimal(pedido.valorFaturado),
      origemAtendimento: pedido.origemAtendimento,
      concluidoEm: pedido.concluidoEm,
    }));

    const apoio = assertividadesDeApoio(paraAssertividade, { de, ate });

    return {
      companyId: query.companyId,
      de: query.de,
      ate: query.ate,
      assertividadeOrcamentaria: apoio.orcamentaria,
      assertividadeExecucao: apoio.execucao,
      indicadorCruzado: indicadorCruzado(
        pedidos.map((pedido) => ({
          origemAtendimento: pedido.origemAtendimento,
          concluidoEm: pedido.concluidoEm,
          passagens: pedido.etapas,
        })),
        { de, ate },
      ),
    };
  }

  // --- Cadastros de apoio ------------------------------------------------

  async listarFornecedores(companyId: string): Promise<FornecedorLista> {
    const linhas = await this.prisma.fornecedor.findMany({
      where: { companyId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    });
    return {
      items: linhas.map((linha) => ({
        id: linha.id,
        companyId: linha.companyId as CompanyKey,
        nome: linha.nome,
        documento: linha.documento,
        ativo: linha.ativo,
      })),
    };
  }

  async criarFornecedor(input: CriarFornecedorRequest, principal: AuthPrincipal): Promise<Fornecedor> {
    const agora = new Date();
    const criado = await this.prisma.$transaction(async (tx) => {
      const fornecedor = await tx.fornecedor.create({
        data: {
          companyId: input.companyId,
          nome: input.nome,
          documento: input.documento ?? null,
        },
      });
      // Quem entra na lista de quem a empresa paga é registro de auditoria, não
      // cadastro qualquer: é a porta da fraude mais comum do ciclo de compras.
      await tx.eventLog.create({
        data: {
          eventName: "compras.fornecedor_cadastrado",
          entityType: "fornecedor",
          entityId: fornecedor.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { companyId: input.companyId, nome: input.nome, documento: input.documento ?? null },
          occurredAt: agora,
        },
      });
      return fornecedor;
    });

    return {
      id: criado.id,
      companyId: criado.companyId as CompanyKey,
      nome: criado.nome,
      documento: criado.documento,
      ativo: criado.ativo,
    };
  }

  async listarObras(companyId: string): Promise<ObraLista> {
    const linhas = await this.prisma.obra.findMany({
      where: { companyId },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ ativa: "desc" }, { nome: "asc" }],
    });
    return {
      items: linhas.map((linha) => ({
        id: linha.id,
        companyId: linha.companyId as CompanyKey,
        nome: linha.nome,
        clientId: linha.clientId,
        clientNome: linha.client?.name ?? null,
        ativa: linha.ativa,
      })),
    };
  }

  async criarObra(input: CriarObraRequest, principal: AuthPrincipal): Promise<Obra> {
    const agora = new Date();
    const criada = await this.prisma.$transaction(async (tx) => {
      const obra = await tx.obra.create({
        data: {
          companyId: input.companyId,
          nome: input.nome,
          clientId: input.clientId ?? null,
        },
        include: { client: { select: { id: true, name: true } } },
      });
      await tx.eventLog.create({
        data: {
          eventName: "compras.obra_cadastrada",
          entityType: "obra",
          entityId: obra.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { companyId: input.companyId, nome: input.nome, clientId: input.clientId ?? null },
          occurredAt: agora,
        },
      });
      return obra;
    });

    return {
      id: criada.id,
      companyId: criada.companyId as CompanyKey,
      nome: criada.nome,
      clientId: criada.clientId,
      clientNome: criada.client?.name ?? null,
      ativa: criada.ativa,
    };
  }
}
