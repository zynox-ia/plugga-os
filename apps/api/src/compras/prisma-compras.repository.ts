import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DIAS_DE_CONCLUIDOS_NO_QUADRO,
  problemaDoDestino,
  type AcaoDoPedido,
  type AtendimentoPeloEstoque,
  type VincularItensAoEstoque,
  type CompanyKey,
  type CriarPedidoDeCompra,
  type EditarPedidoDeCompra,
  type ListarPedidosDeCompraQuery,
  type NomeDeEventoDoCatalogo,
  type ObraDeCompra,
  type OpcoesDeCompraResposta,
  type PedidoDeCompraResumo,
  type QuadroDeComprasQuery,
  type RegistrarCotacao,
  type ContaAPagarDoPedido,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { PrismaContaDaCompraRepository } from "../financeiro/prisma-conta-da-compra.repository";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  INCLUDE_DO_DETALHE,
  INCLUDE_DO_RESUMO,
  paraResumo,
  type LinhaDoDetalhe,
  type NomesDeClientes,
} from "./compras.mapeamento";
import {
  aceitaComprovante,
  aceitaCotacao,
  autoriaDaAcao,
  observacaoDaAcao,
  passagemInicial,
  planejarAcao,
  problemaDaEdicao,
  somarValores,
  type EstadoDoPedido,
} from "./compras.rules";
import { coberturaPeloEstoque, idCanonico, itemIndisponivelParaOPedido, unidadeDiferenteDaDoItem } from "../estoque/estoque.rules";
import { diaComoData, MovimentosDeEstoque } from "../estoque/movimentos-de-estoque";
import { diaEmManaus, fimDoDiaEmManaus, inicioDoDiaEmManaus } from "./dias-uteis";
import { travarPedidoDeCompra } from "./trava-do-pedido";

export type ArquivoGuardado = { chave: string; nome: string; tamanho: number; tipo: string };

type UnidadesDoEstoque = ReadonlyMap<string, { codigo: string; unidade: string }>;

/**
 * A unidade gravada em cada linha (PLU-332): a linha vinculada a um item de
 * estoque usa a unidade do item. Vazia, adota a do item; igual em outra grafia
 * ("M"), grava a do item; diferente ("cx" para um item em "m"), recusa com as
 * duas unidades, em vez de trocar em silêncio. Linha sem vínculo fica livre.
 */
function unidadesDasLinhas(itens: readonly { descricao: string; unidade?: string | null; itemDeEstoqueId?: string | null }[], doEstoque: UnidadesDoEstoque): (string | null)[] {
  return itens.map((linha, n) => {
    if (!linha.itemDeEstoqueId) return linha.unidade ?? null;
    const item = doEstoque.get(idCanonico(linha.itemDeEstoqueId));
    // Todo vínculo passou pela conferência; um que não resolve é erro, nunca linha sem conferência.
    if (!item) throw new RequisicaoInvalida("Item de estoque não encontrado, inativo ou de outra empresa.", [{ campo: `itens.${n}.itemDeEstoqueId`, problema: "Escolha um item ativo do estoque da empresa do pedido." }]);
    if (unidadeDiferenteDaDoItem(linha.unidade, item.unidade)) {
      const mensagem = `A linha “${linha.descricao}” está em ${linha.unidade}, mas o item ${item.codigo} do estoque é controlado em ${item.unidade}. Use ${item.unidade} na linha, ajustando a quantidade, ou desvincule o item.`;
      throw new RequisicaoInvalida(mensagem, [{ campo: `itens.${n}.unidade`, problema: mensagem }]);
    }
    return item.unidade;
  });
}

/** O prazo de entrega desejado não fica no passado: hoje (até 23:59 de Manaus) é o mínimo. */
function garantirPrazoFuturo(dia: string, agora: Date): void {
  if (dia < diaEmManaus(agora)) {
    throw new RequisicaoInvalida("O prazo de entrega desejado não pode ficar no passado.", [{ campo: "prazoEntregaDesejado", problema: "Use hoje ou uma data futura." }]);
  }
}

const DIA_MS = 86_400_000;

/**
 * Persistência de Compras (PLU-327). Cada ação sobre o pedido roda numa
 * transação só, com o pedido travado (`FOR UPDATE`): a etapa, a passagem que
 * fecha, a que abre, a autoria e o evento entram juntos ou não entram.
 */
/** A parte do Financeiro de que Compras precisa (W3). */
type ContaDaCompra = Pick<PrismaContaDaCompraRepository, "criarNaAprovacao" | "cancelarComOPedido" | "contasDosPedidos">;
const SEM_FINANCEIRO: ContaDaCompra = { criarNaAprovacao: async () => null, cancelarComOPedido: async () => undefined, contasDosPedidos: async () => new Map() };

@Injectable()
export class PrismaComprasRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
    @Inject(MovimentosDeEstoque) private readonly estoque: MovimentosDeEstoque,
    // A conta a pagar do pedido aprovado (W3). Sem o Financeiro (nos testes de Compras), nada.
    @Optional() @Inject(PrismaContaDaCompraRepository) private readonly contaDaCompra: ContaDaCompra = SEM_FINANCEIRO,
  ) {}

  // ------------------------------------------------------------ leitura

  async resumos(filtro: Prisma.PedidoDeCompraWhereInput, agora: Date, limite?: number): Promise<{ itens: PedidoDeCompraResumo[]; total: number }> {
    const [linhas, total] = await this.prisma.comContexto((tx) => Promise.all([
      tx.pedidoDeCompra.findMany({ where: filtro, include: INCLUDE_DO_RESUMO, orderBy: { numero: "desc" }, ...(limite ? { take: limite } : {}) }),
      tx.pedidoDeCompra.count({ where: filtro }),
    ]));
    const clientes = await this.nomesDeClientes(linhas.flatMap((linha) => (linha.clientId ? [linha.clientId] : [])));
    return { itens: linhas.map((linha) => paraResumo(linha, clientes, agora)), total };
  }

  filtroDoQuadro(query: QuadroDeComprasQuery, agora: Date): Prisma.PedidoDeCompraWhereInput {
    const periodo = this.periodo(query.de, query.ate);
    // Sem período, a coluna Concluído mostra só os recentes; as etapas em andamento vêm todas.
    const concluidosDesde = periodo ? undefined : new Date(agora.getTime() - DIAS_DE_CONCLUIDOS_NO_QUADRO * DIA_MS);
    return {
      ...this.filtrosComuns(query),
      ...(periodo ? { createdAt: periodo } : {}),
      canceladoEm: null,
      ...(concluidosDesde ? { OR: [{ etapa: { not: "concluido" } }, { concluidoEm: { gte: concluidosDesde } }] } : {}),
    };
  }

  /**
   * Cada filtro é uma condição do `AND`: etapa e situação mexem nas mesmas
   * colunas e precisam se somar, não se sobrescrever (etapa "cotacoes" com
   * situação "concluido" é vazio, não a lista dos concluídos).
   */
  filtroDaLista(query: ListarPedidosDeCompraQuery): Prisma.PedidoDeCompraWhereInput {
    const periodo = this.periodo(query.de, query.ate);
    const numero = query.busca && /^(pc-?)?\d+$/i.test(query.busca) ? Number(query.busca.replace(/\D/g, "")) : null;
    const condicoes: Prisma.PedidoDeCompraWhereInput[] = [this.filtrosComuns(query)];
    if (periodo) condicoes.push({ createdAt: periodo });
    if (query.etapa) condicoes.push({ etapa: query.etapa });
    if (query.situacao === "cancelado") condicoes.push({ canceladoEm: { not: null } });
    if (query.situacao === "concluido") condicoes.push({ etapa: "concluido" });
    if (query.situacao === "em_andamento") condicoes.push({ canceladoEm: null }, { NOT: { etapa: "concluido" } });
    if (query.busca) {
      condicoes.push({ OR: [{ titulo: { contains: query.busca, mode: "insensitive" } }, ...(numero !== null && numero <= 2_147_483_647 ? [{ numero }] : [])] });
    }
    return { AND: condicoes };
  }

  async detalhe(id: string): Promise<{ linha: LinhaDoDetalhe; clientes: NomesDeClientes; contaAPagar: ContaAPagarDoPedido | null }> {
    const [linha, contas] = await this.prisma.comContexto((tx) => Promise.all([
      tx.pedidoDeCompra.findUnique({ where: { id }, include: INCLUDE_DO_DETALHE }),
      this.contaDaCompra.contasDosPedidos(tx, [id]),
    ]));
    if (!linha) throw new NaoEncontrado("Pedido de compra não encontrado.");
    return { linha, clientes: await this.nomesDeClientes(linha.clientId ? [linha.clientId] : []), contaAPagar: contas.get(linha.id) ?? null };
  }

  /** Estado mínimo para decidir acesso a arquivo e etapa, sem o detalhe inteiro. */
  async estado(id: string): Promise<{ etapa: EstadoDoPedido["etapa"]; canceladoEm: Date | null; companyId: string }> {
    const linha = await this.prisma.comContexto((tx) => tx.pedidoDeCompra.findUnique({ where: { id }, select: { etapa: true, canceladoEm: true, companyId: true } }));
    if (!linha) throw new NaoEncontrado("Pedido de compra não encontrado.");
    return linha;
  }

  async opcoes(principal: AuthPrincipal): Promise<OpcoesDeCompraResposta> {
    const [pessoas, obras, fornecedores] = await this.prisma.comContexto((tx) => Promise.all([
      tx.user.findMany({ where: this.elegiveis(principal), select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.obra.findMany({ where: { ativa: true }, select: { id: true, nome: true, companyId: true, clientId: true }, orderBy: { nome: "asc" } }),
      tx.fornecedor.findMany({ where: { ativo: true }, select: { id: true, nome: true, nomeFantasia: true }, orderBy: { nome: "asc" } }),
    ]));
    const clientes = await this.nomesDeClientes(obras.flatMap((obra) => (obra.clientId ? [obra.clientId] : [])));
    return {
      pessoas: pessoas.map((usuario) => ({ id: usuario.id, nome: usuario.name })),
      obras: obras.map((obra) => this.paraObra(obra, clientes)),
      fornecedores,
    };
  }

  async buscarClientes(busca: string): Promise<{ id: string; nome: string }[]> {
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_compras(${busca}, NULL::uuid[])`);
    return linhas.map((linha) => ({ id: linha.id, nome: linha.name }));
  }

  async arquivoDaCotacao(pedidoId: string, cotacaoId: string): Promise<ArquivoGuardado> {
    const cotacao = await this.prisma.comContexto((tx) => tx.cotacaoDeCompra.findFirst({
      where: { id: cotacaoId, pedidoId },
      select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true },
    }));
    if (!cotacao) throw new NaoEncontrado("Cotação não encontrada.");
    return { chave: cotacao.arquivoChave, nome: cotacao.arquivoNome, tamanho: cotacao.arquivoTamanho ?? 0, tipo: cotacao.arquivoTipo ?? "application/octet-stream" };
  }

  /** O comprovante atual (o único não substituído). */
  async comprovante(pedidoId: string): Promise<ArquivoGuardado> {
    await this.estado(pedidoId);
    const atual = await this.prisma.comContexto((tx) => tx.comprovanteDePagamento.findFirst({
      where: { pedidoId, substituidoEm: null },
      select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true },
    }));
    if (!atual) throw new NaoEncontrado("O pedido não tem comprovante.");
    return { chave: atual.arquivoChave, nome: atual.arquivoNome, tamanho: atual.arquivoTamanho, tipo: atual.arquivoTipo };
  }

  // ------------------------------------------------------------ escrita

  /**
   * `ordemDeServicoId`: o pedido nasce do "Pedir material" de uma O.S. (PLU-345).
   * Quem pede é o solicitante e pode não ter acesso a Compras; o RLS confere
   * que ele enxerga a O.S. e que o pedido sai no nome dele.
   */
  async criar(input: CriarPedidoDeCompra, principal: AuthPrincipal, agora: Date, origem?: { ordemDeServicoId: string }): Promise<string> {
    garantirPrazoFuturo(input.prazoEntregaDesejado, agora);
    const solicitanteId = origem ? principal.id : input.solicitanteId ?? principal.id;
    await this.garantirPessoas(principal, [origem ? null : solicitanteId, input.responsavelId ?? null]);
    await this.garantirObra(input.obraId ?? null, input.empresa);
    const passagem = passagemInicial(agora);
    return this.comVinculosValidos(() => this.prisma.comContexto(async (tx) => {
      const doEstoque = await this.garantirItensDeEstoque(input.itens.map((item) => item.itemDeEstoqueId ?? null), input.empresa, tx);
      const unidades = unidadesDasLinhas(input.itens, doEstoque);
      const pedido = await tx.pedidoDeCompra.create({
        data: {
          companyId: input.empresa,
          titulo: input.titulo,
          descricao: input.descricao ?? null,
          destino: input.destino,
          obraId: input.obraId ?? null,
          clientId: input.clientId ?? null,
          solicitanteId,
          responsavelId: input.responsavelId ?? null,
          criadoPorId: principal.id,
          prazoEntregaDesejado: fimDoDiaEmManaus(input.prazoEntregaDesejado),
          valorOrcado: input.valorOrcado ?? null,
          ordemDeServicoId: origem?.ordemDeServicoId ?? null,
          // A criação segue o relógio injetado, como o prazo e a passagem inicial: as regras
          // comparam dias com ela (o recebimento não pode ser anterior à criação).
          createdAt: agora,
          itens: { create: input.itens.map((item, n) => ({ descricao: item.descricao, quantidade: item.quantidade, unidade: unidades[n] ?? null, itemDeEstoqueId: item.itemDeEstoqueId ?? null })) },
          etapas: { create: { ...passagem, responsavelId: input.responsavelId ?? null } },
        },
        select: { id: true, numero: true },
      });
      await this.registrar(tx, "compras.pedido.created", "pedido_de_compra", pedido.id, input.empresa, principal, {
        numero: pedido.numero, destino: input.destino, itens: input.itens.length, ...(origem ? { ordemDeServicoId: origem.ordemDeServicoId } : {}),
      });
      return pedido.id;
    }));
  }

  async editar(id: string, input: EditarPedidoDeCompra, principal: AuthPrincipal, agora: Date): Promise<void> {
    const campos = Object.entries(input).filter(([, valor]) => valor !== undefined).map(([campo]) => campo).sort();
    if (campos.length === 0) return;
    if (input.prazoEntregaDesejado !== undefined) garantirPrazoFuturo(input.prazoEntregaDesejado, agora);
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, id);
      const atual = await tx.pedidoDeCompra.findUnique({ where: { id }, select: { etapa: true, canceladoEm: true, companyId: true, destino: true, obraId: true, clientId: true } });
      if (!atual) throw new NaoEncontrado("Pedido de compra não encontrado.");
      const recusa = problemaDaEdicao(atual, input.itens !== undefined);
      if (recusa) throw new EstadoInvalido(recusa.mensagem);

      const destinoFinal = {
        destino: input.destino ?? atual.destino,
        obraId: input.obraId !== undefined ? input.obraId : input.destino && input.destino !== "obra" ? null : atual.obraId,
        clientId: input.clientId !== undefined ? input.clientId : input.destino && input.destino !== "cliente" ? null : atual.clientId,
      };
      const problema = problemaDoDestino(destinoFinal);
      if (problema) throw new RequisicaoInvalida(problema.problema, [problema]);
      const empresa = input.empresa ?? (atual.companyId as CompanyKey);
      if (destinoFinal.obraId && (input.obraId !== undefined || input.empresa !== undefined)) await this.garantirObra(destinoFinal.obraId, empresa, tx);
      await this.garantirPessoas(principal, [input.solicitanteId ?? null, input.responsavelId ?? null], tx);
      // O vínculo com o estoque é da empresa do pedido: vale para itens novos e para a troca de empresa.
      const vinculos = input.itens
        ? input.itens.map((item) => item.itemDeEstoqueId ?? null)
        : input.empresa !== undefined ? (await tx.itemDePedido.findMany({ where: { pedidoId: id }, select: { itemDeEstoqueId: true } })).map((item) => item.itemDeEstoqueId) : [];
      const doEstoque = await this.garantirItensDeEstoque(vinculos, empresa, tx);
      const unidades = input.itens ? unidadesDasLinhas(input.itens, doEstoque) : [];

      try {
        await tx.pedidoDeCompra.update({
          where: { id },
          data: {
            ...(input.empresa !== undefined ? { companyId: input.empresa } : {}),
            ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
            ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
            ...(input.prazoEntregaDesejado !== undefined ? { prazoEntregaDesejado: fimDoDiaEmManaus(input.prazoEntregaDesejado) } : {}),
            ...(input.valorOrcado !== undefined ? { valorOrcado: input.valorOrcado } : {}),
            ...(input.solicitanteId !== undefined ? { solicitanteId: input.solicitanteId } : {}),
            ...(input.responsavelId !== undefined ? { responsavelId: input.responsavelId } : {}),
            ...destinoFinal,
          },
        });
      } catch (erro) {
        this.traduzirVinculo(erro);
      }
      if (input.responsavelId !== undefined) {
        await tx.pedidoDeCompraEtapa.updateMany({ where: { pedidoId: id, saiuEm: null }, data: { responsavelId: input.responsavelId } });
      }
      if (input.itens) {
        await tx.itemDePedido.deleteMany({ where: { pedidoId: id } });
        await tx.itemDePedido.createMany({ data: input.itens.map((item, n) => ({ pedidoId: id, descricao: item.descricao, quantidade: item.quantidade, unidade: unidades[n] ?? null, itemDeEstoqueId: item.itemDeEstoqueId ?? null })) });
      }
      await this.registrar(tx, "compras.pedido.updated", "pedido_de_compra", id, empresa, principal, { campos });
    });
  }

  async executarAcao(id: string, acao: AcaoDoPedido, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, id);
      const pedido = await tx.pedidoDeCompra.findUnique({
        where: { id },
        select: {
          etapa: true, canceladoEm: true, origemAtendimento: true, cotacaoSelecionadaId: true, companyId: true, responsavelId: true,
          destino: true, obraId: true, clientId: true, createdAt: true,
          cotacoes: { select: { id: true, valor: true, valorFrete: true, prazoEntregaDias: true } },
          etapas: { where: { saiuEm: null }, select: { id: true, prazoEm: true } },
        },
      });
      if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
      const aberta = pedido.etapas[0] ?? null;
      const estado: EstadoDoPedido = {
        etapa: pedido.etapa,
        canceladoEm: pedido.canceladoEm,
        origemAtendimento: pedido.origemAtendimento,
        cotacaoSelecionadaId: pedido.cotacaoSelecionadaId,
        cotacoes: pedido.cotacoes.map((cotacao) => ({
          id: cotacao.id,
          valorTotal: somarValores(cotacao.valor.toFixed(2), cotacao.valorFrete?.toFixed(2) ?? null),
          prazoEntregaDias: cotacao.prazoEntregaDias,
        })),
        passagemAberta: aberta ? { prazoEm: aberta.prazoEm } : null,
        criadoEm: pedido.createdAt,
      };
      const resultado = planejarAcao(estado, acao, agora);
      if (!resultado.ok) {
        if (resultado.recusa.codigo === "CONFLITO_ESTADO") throw new EstadoInvalido(resultado.recusa.mensagem);
        throw new RequisicaoInvalida(resultado.recusa.mensagem);
      }
      const { alteracoes, fecharPassagem, abrirPassagem, evento } = resultado.plano;

      // Estoque (PLU-332), na mesma transação da etapa: reservar, baixar, dar entrada ou liberar.
      const doPedido = { id, companyId: pedido.companyId, destino: pedido.destino, obraId: pedido.obraId, clientId: pedido.clientId };
      const hoje = diaComoData(diaEmManaus(agora));
      if (acao.acao === "decidir_estoque" && acao.origem === "estoque") await this.estoque.reservar(tx, doPedido, principal, agora);
      if (acao.acao === "confirmar_recebimento") {
        // A movimentação do recebimento leva o dia em que o material chegou, não o do registro.
        const recebidoEm = diaComoData(acao.recebidoEm);
        if (pedido.origemAtendimento === "estoque") {
          if (acao.entradaNoEstoque) throw new RequisicaoInvalida("Pedido atendido pelo estoque não dá entrada: a reserva vira saída.");
          await this.estoque.baixarReservas(tx, doPedido, principal, agora, recebidoEm);
        } else if (acao.entradaNoEstoque) {
          await this.estoque.entradaDoRecebimento(tx, doPedido, acao.entradaNoEstoque, principal, agora, recebidoEm);
        }
      }
      if (acao.acao === "cancelar") await this.estoque.liberarReservas(tx, doPedido, principal, agora, hoje);

      if (fecharPassagem && aberta) {
        await tx.pedidoDeCompraEtapa.update({
          where: { id: aberta.id },
          data: { ...fecharPassagem, saiuPorId: principal.id, observacao: observacaoDaAcao(acao) },
        });
      }
      if (abrirPassagem) {
        await tx.pedidoDeCompraEtapa.create({ data: { ...abrirPassagem, pedidoId: id, responsavelId: pedido.responsavelId } });
      }
      await tx.pedidoDeCompra.update({ where: { id }, data: { ...alteracoes, ...autoriaDaAcao(acao, principal.id, agora) } });
      // A aprovação gera a conta a pagar no Financeiro, na mesma transação (W3, PLU-341).
      if (acao.acao === "aprovar") await this.contaDaCompra.criarNaAprovacao(tx, id, principal);
      // O cancelamento leva junto a conta ainda não paga (W3c).
      if (acao.acao === "cancelar") await this.contaDaCompra.cancelarComOPedido(tx, id, acao.motivo, principal);
      await this.registrar(tx, evento, "pedido_de_compra", id, pedido.companyId, principal, {
        acao: acao.acao,
        de: pedido.etapa,
        para: alteracoes.etapa ?? pedido.etapa,
        ...(acao.acao === "selecionar_cotacao" ? { cotacaoId: acao.cotacaoId } : {}),
        // O motivo da revisão e do cancelamento fica na passagem: texto livre não vai ao evento (sem PII).
        ...(acao.acao === "revisar" || acao.acao === "cancelar" ? { comMotivo: true } : {}),
        ...(fecharPassagem ? { cumpriuPrazo: fecharPassagem.cumpriuPrazo } : {}),
      });
    });
  }

  async registrarCotacao(pedidoId: string, dados: RegistrarCotacao, arquivo: ArquivoGuardado, principal: AuthPrincipal): Promise<string> {
    return this.prisma.comContexto(async (tx) => {
      await this.travar(tx, pedidoId);
      const pedido = await tx.pedidoDeCompra.findUnique({ where: { id: pedidoId }, select: { etapa: true, canceladoEm: true, companyId: true } });
      if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
      if (!aceitaCotacao(pedido)) throw new EstadoInvalido("Cotação só é registrada na etapa de cotações de um pedido em andamento.");
      const fornecedor = await tx.fornecedor.findUnique({ where: { id: dados.fornecedorId }, select: { ativo: true } });
      if (!fornecedor) throw new RequisicaoInvalida("Fornecedor não encontrado.", [{ campo: "fornecedorId", problema: "Escolha um fornecedor do cadastro." }]);
      if (!fornecedor.ativo) throw new RequisicaoInvalida("O fornecedor está inativo.", [{ campo: "fornecedorId", problema: "Reative o fornecedor ou escolha outro." }]);
      const cotacao = await tx.cotacaoDeCompra.create({
        data: {
          pedidoId,
          fornecedorId: dados.fornecedorId,
          valor: dados.valor,
          valorFrete: dados.valorFrete ?? null,
          prazoEntregaDias: dados.prazoEntregaDias ?? null,
          condicoesPagamento: dados.condicoesPagamento ?? null,
          arquivoChave: arquivo.chave,
          arquivoNome: arquivo.nome,
          arquivoTamanho: arquivo.tamanho,
          arquivoTipo: arquivo.tipo,
          criadoPorId: principal.id,
        },
        select: { id: true },
      });
      await this.registrar(tx, "compras.cotacao.created", "cotacao_de_compra", cotacao.id, pedido.companyId, principal, { pedidoId, fornecedorId: dados.fornecedorId });
      return cotacao.id;
    });
  }

  /**
   * Grava o comprovante novo como o atual. O anterior não é apagado: fica
   * marcado como substituído, com quem trocou e quando, e o arquivo continua
   * no armazenamento. Apagar evidência de pagamento não é operação do sistema.
   */
  async registrarComprovante(pedidoId: string, arquivo: ArquivoGuardado, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, pedidoId);
      const pedido = await tx.pedidoDeCompra.findUnique({ where: { id: pedidoId }, select: { etapa: true, canceladoEm: true, companyId: true } });
      if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
      if (!aceitaComprovante(pedido)) throw new EstadoInvalido("O comprovante é enviado na etapa de pagamento, antes de registrá-lo.");
      const { count } = await tx.comprovanteDePagamento.updateMany({
        where: { pedidoId, substituidoEm: null },
        data: { substituidoEm: agora, substituidoPorId: principal.id },
      });
      const novo = await tx.comprovanteDePagamento.create({
        data: { pedidoId, arquivoChave: arquivo.chave, arquivoNome: arquivo.nome, arquivoTamanho: arquivo.tamanho, arquivoTipo: arquivo.tipo, enviadoPorId: principal.id, enviadoEm: agora },
        select: { id: true },
      });
      await this.registrar(tx, "compras.pedido.comprovante_enviado", "pedido_de_compra", pedidoId, pedido.companyId, principal, { comprovanteId: novo.id, substituiu: count > 0 });
    });
  }

  /** Quanto o estoque da empresa do pedido atende, item a item (análise de estoque). */
  async atendimento(pedidoId: string): Promise<AtendimentoPeloEstoque> {
    const pedido = await this.prisma.comContexto((tx) => tx.pedidoDeCompra.findUnique({
      where: { id: pedidoId },
      select: {
        companyId: true,
        itens: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true, descricao: true, quantidade: true, unidade: true,
            itemDeEstoque: { select: { id: true, codigo: true, nome: true, unidade: true, emEstoque: true, reservado: true, ativo: true, companyId: true } },
          },
        },
      },
    }));
    if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
    // As mesmas condições da reserva: linhas do mesmo item dividem o disponível; inativo e outra empresa não atendem.
    const cobertura = coberturaPeloEstoque(pedido.itens.map((item) => ({ quantidade: item.quantidade, unidade: item.unidade, item: item.itemDeEstoque })), pedido.companyId);
    return {
      itens: pedido.itens.map((item, i) => {
        const linha = cobertura.linhas[i]!;
        // Vínculo com item de outra empresa (inconsistente): só o motivo, nada do item.
        const estoque = linha.motivo === "outra_empresa" ? null : item.itemDeEstoque;
        return {
          itemDoPedidoId: item.id,
          descricao: item.descricao,
          quantidadePedida: item.quantidade.toFixed(3),
          unidadePedida: item.unidade,
          itemDeEstoque: estoque ? { id: estoque.id, codigo: estoque.codigo, nome: estoque.nome, unidade: estoque.unidade } : null,
          disponivel: linha.disponivel?.toFixed(3) ?? null,
          pedidoDoItem: linha.pedidoDoItem?.toFixed(3) ?? null,
          atende: linha.atende.toFixed(3),
          motivo: linha.motivo,
        };
      }),
      atendeTudo: cobertura.atendeTudo,
    };
  }

  /** Liga ou desliga os itens do pedido aos itens de estoque da empresa do pedido, até a análise. */
  async vincularItens(pedidoId: string, input: VincularItensAoEstoque, principal: AuthPrincipal): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, pedidoId);
      const pedido = await tx.pedidoDeCompra.findUniqueOrThrow({ where: { id: pedidoId }, select: { etapa: true, canceladoEm: true, companyId: true, itens: { select: { id: true, descricao: true, unidade: true } } } });
      const recusa = problemaDaEdicao(pedido, true);
      if (recusa) throw new EstadoInvalido(recusa.mensagem);
      const doPedido = new Map(pedido.itens.map((item) => [idCanonico(item.id), item]));
      if (input.itens.some((item) => !doPedido.has(idCanonico(item.itemDoPedidoId)))) throw new RequisicaoInvalida("Um dos itens não é deste pedido.");
      if (new Set(input.itens.map((item) => idCanonico(item.itemDoPedidoId))).size !== input.itens.length) throw new RequisicaoInvalida("Item do pedido repetido nos vínculos.");
      const doEstoque = await this.garantirItensDeEstoque(input.itens.map((item) => item.itemDeEstoqueId), pedido.companyId as CompanyKey, tx);
      // Vincular: a linha passa a usar a unidade do item (vazia adota; diferente recusa). Desvincular mantém a unidade.
      const unidades = unidadesDasLinhas(input.itens.map((item) => ({ ...doPedido.get(idCanonico(item.itemDoPedidoId))!, itemDeEstoqueId: item.itemDeEstoqueId })), doEstoque);
      for (const [n, item] of input.itens.entries()) {
        await tx.itemDePedido.update({ where: { id: item.itemDoPedidoId }, data: { itemDeEstoqueId: item.itemDeEstoqueId, ...(item.itemDeEstoqueId ? { unidade: unidades[n] } : {}) } });
      }
      await this.registrar(tx, "compras.pedido.updated", "pedido_de_compra", pedidoId, pedido.companyId, principal, { campos: ["itens.itemDeEstoqueId"] });
    });
  }

  // ------------------------------------------------------------ apoio

  /**
   * Item de estoque vinculado: existe, está ativo e é da empresa do pedido.
   * Confere na transação que grava o vínculo, com os itens travados em modo
   * compartilhado (em ordem de id): a troca de empresa do item, que trava o item
   * para escrever, espera o vínculo terminar ou termina antes da conferência.
   */
  private async garantirItensDeEstoque(ids: (string | null)[], empresa: CompanyKey, tx: Prisma.TransactionClient): Promise<UnidadesDoEstoque> {
    const alvos = [...new Set(ids.filter((id): id is string => id !== null).map(idCanonico))].sort();
    if (alvos.length === 0) return new Map();
    const travados = await tx.$queryRaw<{ id: string; company_id: string; ativo: boolean; codigo: string; unidade: string }[]>`
      SELECT id, company_id, ativo, codigo, unidade FROM public.itens_de_estoque WHERE id = ANY(${alvos}::uuid[]) ORDER BY id FOR SHARE`;
    const validos = travados.filter((item) => itemIndisponivelParaOPedido({ companyId: item.company_id, ativo: item.ativo }, { empresa, exigirAtivo: true }) === null);
    if (validos.length !== alvos.length) {
      // A recusa aponta cada linha (pelo índice em `ids`, a ordem do envio), além do campo genérico.
      const aceitos = new Set(validos.map((item) => idCanonico(item.id)));
      const problema = "Escolha um item ativo do estoque da empresa do pedido.";
      const linhas = ids.flatMap((id, n) => (id !== null && !aceitos.has(idCanonico(id)) ? [{ campo: `itens.${n}.itemDeEstoqueId`, problema }] : []));
      throw new RequisicaoInvalida("Item de estoque não encontrado, inativo ou de outra empresa.", [{ campo: "itemDeEstoqueId", problema }, ...linhas]);
    }
    return new Map(validos.map((item) => [idCanonico(item.id), { codigo: item.codigo, unidade: item.unidade }]));
  }

  private filtrosComuns(query: { empresa?: CompanyKey; responsavelId?: string; destino?: Prisma.PedidoDeCompraWhereInput["destino"] }): Prisma.PedidoDeCompraWhereInput {
    return {
      ...(query.empresa ? { companyId: query.empresa } : {}),
      ...(query.responsavelId ? { responsavelId: query.responsavelId } : {}),
      ...(query.destino ? { destino: query.destino } : {}),
    };
  }

  private periodo(de?: string, ate?: string): Prisma.DateTimeFilter | null {
    if (!de && !ate) return null;
    return { ...(de ? { gte: inicioDoDiaEmManaus(de) } : {}), ...(ate ? { lte: fimDoDiaEmManaus(ate) } : {}) };
  }

  /** Quem pode ser solicitante ou responsável: pessoa ativa com a tela Compras, ou quem está pedindo. */
  private elegiveis(principal: AuthPrincipal): Prisma.UserWhereInput {
    return {
      status: "active",
      OR: [
        { id: principal.id },
        { departamentos: { some: { departamento: "suprimentos", telas: { has: "suprimentos.compras" } } } },
      ],
    };
  }

  private async garantirPessoas(principal: AuthPrincipal, ids: (string | null)[], tx?: Prisma.TransactionClient): Promise<void> {
    const alvos = [...new Set(ids.filter((id): id is string => id !== null).map(idCanonico))];
    if (alvos.length === 0) return;
    const consultar = (cliente: Prisma.TransactionClient) => cliente.user.count({ where: { AND: [{ id: { in: alvos } }, this.elegiveis(principal)] } });
    const encontrados = tx ? await consultar(tx) : await this.prisma.comContexto(consultar);
    if (encontrados !== alvos.length) {
      throw new RequisicaoInvalida("Solicitante e responsável precisam ser pessoas ativas com acesso a Compras.", [
        { campo: "responsavelId", problema: "Escolha uma pessoa com acesso a Compras." },
      ]);
    }
  }

  private async garantirObra(obraId: string | null, empresa: CompanyKey, tx?: Prisma.TransactionClient): Promise<void> {
    if (!obraId) return;
    const consultar = (cliente: Prisma.TransactionClient) => cliente.obra.findUnique({ where: { id: obraId }, select: { ativa: true, companyId: true } });
    const obra = tx ? await consultar(tx) : await this.prisma.comContexto(consultar);
    if (!obra || !obra.ativa) throw new RequisicaoInvalida("Obra não encontrada ou inativa.", [{ campo: "obraId", problema: "Escolha uma obra ativa." }]);
    if (obra.companyId !== empresa) throw new RequisicaoInvalida("A obra é de outra empresa.", [{ campo: "obraId", problema: "Escolha uma obra da mesma empresa do pedido." }]);
  }

  /** Cliente que não existe chega como violação de chave estrangeira. */
  private async comVinculosValidos<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      return this.traduzirVinculo(erro);
    }
  }

  private traduzirVinculo(erro: unknown): never {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
      throw new RequisicaoInvalida("Cliente não encontrado.", [{ campo: "clientId", problema: "Escolha um cliente do cadastro." }]);
    }
    throw erro;
  }

  private async travar(tx: Prisma.TransactionClient, id: string): Promise<void> {
    // A trava comum primeiro (a entrada por compra no Estoque também a toma), depois a linha.
    await travarPedidoDeCompra(tx, id);
    const linhas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.pedidos_de_compra WHERE id = ${id}::uuid FOR UPDATE`;
    if (linhas.length === 0) throw new NaoEncontrado("Pedido de compra não encontrado.");
  }

  private async nomesDeClientes(ids: string[]): Promise<NomesDeClientes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_compras(NULL, ${unicos}::uuid[])`);
    return new Map(linhas.map((linha) => [linha.id, linha.name]));
  }

  private paraObra(obra: { id: string; nome: string; companyId: string; clientId: string | null }, clientes: NomesDeClientes): ObraDeCompra {
    return {
      id: obra.id,
      empresa: obra.companyId as CompanyKey,
      nome: obra.nome,
      cliente: obra.clientId ? { id: obra.clientId, nome: clientes.get(obra.clientId) ?? "Cliente" } : null,
    };
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: NomeDeEventoDoCatalogo,
    entityType: string,
    entityId: string,
    companyId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
