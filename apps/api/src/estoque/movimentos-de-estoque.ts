import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ComprasDestino, type ComprasEtapa, type EstoqueDestinoSaida, type EstoqueOrigemEntrada } from "@prisma/client";
import type { NomeDeEventoDoCatalogo } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import { travarPedidoDeCompra } from "../compras/trava-do-pedido";
import { D, itemIndisponivelParaOPedido, planejarMovimento, problemaDaEntradaDoPedido, unidadeDiferenteDaDoItem, type MovimentoPlanejado, type PedidoDaEntrada } from "./estoque.rules";

/** Origem ou destino gravado na movimentação. */
export type VinculoDoMovimento = {
  origem?: EstoqueOrigemEntrada | null;
  destino?: EstoqueDestinoSaida | null;
  obraId?: string | null;
  clientId?: string | null;
  area?: string | null;
  pedidoId?: string | null;
  reservaId?: string | null;
};

export type MovimentoParaAplicar = {
  itemId: string;
  movimento: MovimentoPlanejado;
  /** Dia do movimento: início do dia em Manaus (`diaComoData`). */
  data: Date;
  vinculo: VinculoDoMovimento;
  observacao: string | null;
  /** Item inativo só aceita o que encerra compromissos (baixa e liberação). */
  exigirAtivo: boolean;
  /** Empresa exigida do item (a do pedido, quando vem de Compras). */
  empresa?: string;
};

type Pedido = { id: string; companyId: string; destino: ComprasDestino; obraId: string | null; clientId: string | null };

/** O dia de Manaus (AAAA-MM-DD) como o instante que a coluna `data` guarda: o início do dia em Manaus. */
export const diaComoData = (dia: string) => inicioDoDiaEmManaus(dia);

export type PedidoParaEntradaDoItem = PedidoDaEntrada & { id: string; titulo: string; etapa: ComprasEtapa };

/**
 * Os pedidos da empresa do item com linha vinculada a ele, com o total pedido e
 * o que já entrou por compra. Lê pela função restrita do banco
 * (`plugga_security.pedidos_para_entrada_do_item`), que entrega só isso a quem
 * pode registrar a movimentação, inclusive a quem só tem a tela de Estoque.
 */
export async function pedidosParaEntrada(tx: Prisma.TransactionClient, itemId: string, pedidoId: string | null): Promise<PedidoParaEntradaDoItem[]> {
  const linhas = await tx.$queryRaw<{ id: string; numero: number; titulo: string; etapa: ComprasEtapa; cancelado: boolean; atendido_pelo_estoque: boolean; pedida: Prisma.Decimal; recebida: Prisma.Decimal }[]>`
    SELECT id, numero, titulo, etapa, cancelado, atendido_pelo_estoque, pedida, recebida
    FROM plugga_security.pedidos_para_entrada_do_item(${itemId}::uuid, ${pedidoId}::uuid)`;
  return linhas.map((l) => ({
    id: l.id, numero: l.numero, titulo: l.titulo, etapa: l.etapa, cancelado: l.cancelado, atendidoPeloEstoque: l.atendido_pelo_estoque, pedida: D(l.pedida), recebida: D(l.recebida),
  }));
}

/**
 * O único caminho de escrita do saldo (PLU-332). Cada movimento trava o item
 * (`FOR UPDATE`), planeja pelas regras puras, grava o saldo e a movimentação e
 * registra o evento — sempre na transação de quem chamou: a tela do Estoque ou
 * a ação do pedido de compra. Itens são travados em ordem de id para duas
 * transações com os mesmos itens nunca se bloquearem em ciclo.
 */
@Injectable()
export class MovimentosDeEstoque {
  constructor(@Inject(AuditAppender) private readonly auditoria: AuditAppender) {}

  async aplicar(tx: Prisma.TransactionClient, m: MovimentoParaAplicar, principal: AuthPrincipal, agora: Date) {
    const entradaDoPedido = m.movimento.tipo === "entrada" && m.vinculo.origem === "compra" && m.vinculo.pedidoId ? m.vinculo.pedidoId : null;
    // Pedido antes do item, como Compras: o limite confere o pedido sem corrida com cancelamento ou edição.
    if (entradaDoPedido) await travarPedidoDeCompra(tx, entradaDoPedido);
    const travado = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.itens_de_estoque WHERE id = ${m.itemId}::uuid FOR UPDATE`;
    if (travado.length === 0) throw new NaoEncontrado("Item de estoque não encontrado.");
    const item = await tx.itemDeEstoque.findUniqueOrThrow({ where: { id: m.itemId }, select: { emEstoque: true, reservado: true, custoMedio: true, ativo: true, companyId: true } });
    // A mesma regra da análise de estoque (cobertura), aqui sob a trava do item.
    const indisponivel = itemIndisponivelParaOPedido(item, { empresa: m.empresa, exigirAtivo: m.exigirAtivo });
    if (indisponivel === "outra_empresa") throw new RequisicaoInvalida("O item de estoque é de outra empresa.", [{ campo: "itemId", problema: "Escolha um item da mesma empresa." }]);
    if (indisponivel === "inativo") throw new EstadoInvalido("O item de estoque está inativo.");
    if (entradaDoPedido && m.movimento.tipo === "entrada") await this.garantirLimiteDaEntradaDoPedido(tx, entradaDoPedido, m.itemId, m.movimento.quantidade);

    const plano = planejarMovimento(item, m.movimento);
    if (!plano.ok) throw new EstadoInvalido(plano.recusa.mensagem, plano.recusa.campo ? [{ campo: plano.recusa.campo, problema: plano.recusa.mensagem }] : undefined);
    const r = plano.resultado;

    await tx.itemDeEstoque.update({
      where: { id: m.itemId },
      data: { emEstoque: r.emEstoque, reservado: r.reservado, custoMedio: r.custoMedio, ultimaMovimentacaoEm: agora },
    });
    const movimentacao = await tx.movimentacaoDeEstoque.create({
      data: {
        itemId: m.itemId,
        tipo: r.tipo,
        data: m.data,
        quantidade: r.quantidade,
        custoUnitario: m.movimento.tipo === "entrada" ? m.movimento.custoUnitario : null,
        custoMedioNoMomento: r.custoMedioNoMomento,
        origem: m.vinculo.origem ?? null,
        destino: m.vinculo.destino ?? null,
        obraId: m.vinculo.obraId ?? null,
        clientId: m.vinculo.clientId ?? null,
        area: m.vinculo.area ?? null,
        pedidoId: m.vinculo.pedidoId ?? null,
        reservaId: m.vinculo.reservaId ?? null,
        observacao: m.observacao,
        saldoDepois: r.emEstoque,
        registradaPorId: principal.id,
        registradaEm: agora,
      },
      select: { id: true },
    });
    await this.registrar(tx, "estoque.movimentacao.created", "movimentacao_de_estoque", movimentacao.id, item.companyId, principal, {
      tipo: r.tipo,
      itemId: m.itemId,
      ...(m.vinculo.pedidoId ? { pedidoId: m.vinculo.pedidoId } : {}),
    });
    return movimentacao;
  }

  /** "Atender pelo estoque": cada item do pedido, vinculado, ganha uma reserva do que pede. */
  async reservar(tx: Prisma.TransactionClient, pedido: Pedido, principal: AuthPrincipal, agora: Date): Promise<void> {
    const itens = await tx.itemDePedido.findMany({ where: { pedidoId: pedido.id }, select: { id: true, descricao: true, quantidade: true, unidade: true, itemDeEstoqueId: true }, orderBy: { itemDeEstoqueId: "asc" } });
    const semVinculo = itens.filter((item) => !item.itemDeEstoqueId);
    if (itens.length === 0 || semVinculo.length > 0) {
      throw new EstadoInvalido("Para atender pelo estoque, todos os itens do pedido precisam estar vinculados a um item de estoque.");
    }
    // Trava os itens (em ordem de id) ANTES de criar as reservas: a chave estrangeira da reserva
    // segura o item em modo compartilhado, e duas reservas do mesmo item subindo de compartilhado
    // para exclusivo se travavam em ciclo (auditoria de 27/11/2026, S3).
    const ids = [...new Set(itens.map((item) => item.itemDeEstoqueId!))].sort();
    const travados = await this.travarItens(tx, ids);
    // Com os itens travados, a unidade de cada linha tem de ser a do item: o número reservado é contado nela.
    for (const item of itens) {
      const doEstoque = travados.get(item.itemDeEstoqueId!);
      if (doEstoque && unidadeDiferenteDaDoItem(item.unidade, doEstoque.unidade)) {
        throw new EstadoInvalido(`Não dá para atender pelo estoque: a linha “${item.descricao}” está em ${item.unidade} e o item ${doEstoque.codigo} é controlado em ${doEstoque.unidade}. Corrija a unidade e a quantidade da linha (ou desvincule o item) e decida de novo.`);
      }
    }
    for (const item of itens) {
      const reserva = await tx.reservaDeEstoque.create({
        data: { itemId: item.itemDeEstoqueId!, pedidoId: pedido.id, itemDoPedidoId: item.id, quantidade: item.quantidade, reservadaPorId: principal.id, reservadaEm: agora },
        select: { id: true },
      });
      await this.aplicar(tx, {
        itemId: item.itemDeEstoqueId!,
        movimento: { tipo: "reserva", quantidade: D(item.quantidade) },
        data: diaComoData(diaEmManaus(agora)),
        vinculo: { pedidoId: pedido.id, reservaId: reserva.id, ...this.destinoDoPedido(pedido) },
        observacao: null,
        exigirAtivo: true,
        empresa: pedido.companyId,
      }, principal, agora);
      await this.registrar(tx, "estoque.reserva.created", "reserva_de_estoque", reserva.id, pedido.companyId, principal, { pedidoId: pedido.id });
    }
  }

  /** Recebimento de pedido atendido pelo estoque: cada reserva ativa vira saída para o destino do pedido. */
  async baixarReservas(tx: Prisma.TransactionClient, pedido: Pedido, principal: AuthPrincipal, agora: Date, dia: Date): Promise<void> {
    await this.encerrarReservas(tx, pedido, "baixada", principal, agora, dia);
  }

  /** Cancelamento: cada reserva ativa volta para o disponível. */
  async liberarReservas(tx: Prisma.TransactionClient, pedido: Pedido, principal: AuthPrincipal, agora: Date, dia: Date): Promise<void> {
    await this.encerrarReservas(tx, pedido, "liberada", principal, agora, dia);
  }

  /** Recebimento de aquisição com entrada no estoque: cada item do pedido indicado entra no item vinculado. */
  async entradaDoRecebimento(
    tx: Prisma.TransactionClient,
    pedido: Pedido,
    entradas: readonly { itemDoPedidoId: string; quantidade: string; custoUnitario: string }[],
    principal: AuthPrincipal,
    agora: Date,
    dia: Date,
  ): Promise<void> {
    const ids = entradas.map((entrada) => entrada.itemDoPedidoId);
    if (new Set(ids).size !== ids.length) throw new RequisicaoInvalida("Item do pedido repetido na entrada no estoque.");
    const itens = await tx.itemDePedido.findMany({ where: { pedidoId: pedido.id, id: { in: ids } }, select: { id: true, descricao: true, unidade: true, itemDeEstoqueId: true } });
    const porId = new Map(itens.map((item) => [item.id, item.itemDeEstoqueId]));
    // Trava os itens (em ordem de id) e confere a unidade de cada linha contra a do item antes de dar entrada.
    const travados = await this.travarItens(tx, [...new Set(itens.flatMap((item) => (item.itemDeEstoqueId ? [item.itemDeEstoqueId] : [])))].sort());
    for (const item of itens) {
      const doEstoque = item.itemDeEstoqueId ? travados.get(item.itemDeEstoqueId) : undefined;
      if (doEstoque && unidadeDiferenteDaDoItem(item.unidade, doEstoque.unidade)) {
        throw new EstadoInvalido(`A linha “${item.descricao}” está em ${item.unidade} e o item ${doEstoque.codigo} é controlado em ${doEstoque.unidade}: tire a linha da entrada no estoque e registre a entrada pela tela do Estoque, em ${doEstoque.unidade}.`);
      }
    }
    const ordenadas = [...entradas].sort((a, b) => String(porId.get(a.itemDoPedidoId)).localeCompare(String(porId.get(b.itemDoPedidoId))));
    for (const entrada of ordenadas) {
      const itemDeEstoqueId = porId.get(entrada.itemDoPedidoId);
      if (itemDeEstoqueId === undefined) throw new RequisicaoInvalida("A entrada no estoque cita um item que não é deste pedido.");
      if (!itemDeEstoqueId) throw new RequisicaoInvalida("Vincule o item do pedido a um item de estoque antes de dar entrada.");
      await this.aplicar(tx, {
        itemId: itemDeEstoqueId,
        movimento: { tipo: "entrada", quantidade: D(entrada.quantidade), custoUnitario: D(entrada.custoUnitario) },
        data: dia,
        vinculo: { origem: "compra", pedidoId: pedido.id },
        observacao: null,
        exigirAtivo: true,
        empresa: pedido.companyId,
      }, principal, agora);
    }
  }

  private async encerrarReservas(tx: Prisma.TransactionClient, pedido: Pedido, estado: "baixada" | "liberada", principal: AuthPrincipal, agora: Date, dia: Date): Promise<void> {
    const reservas = await tx.reservaDeEstoque.findMany({ where: { pedidoId: pedido.id, estado: "ativa" }, select: { id: true, itemId: true, quantidade: true }, orderBy: { itemId: "asc" } });
    for (const reserva of reservas) {
      const { count } = await tx.reservaDeEstoque.updateMany({
        where: { id: reserva.id, estado: "ativa" },
        data: { estado, encerradaEm: agora, encerradaPorId: principal.id },
      });
      if (count !== 1) continue;
      await this.aplicar(tx, {
        itemId: reserva.itemId,
        movimento: estado === "baixada" ? { tipo: "baixa", quantidade: D(reserva.quantidade) } : { tipo: "liberacao", quantidade: D(reserva.quantidade) },
        data: dia,
        vinculo: { pedidoId: pedido.id, reservaId: reserva.id, ...(estado === "baixada" ? this.destinoDoPedido(pedido) : {}) },
        observacao: null,
        exigirAtivo: false,
      }, principal, agora);
      await this.registrar(tx, estado === "baixada" ? "estoque.reserva.baixada" : "estoque.reserva.liberada", "reserva_de_estoque", reserva.id, pedido.companyId, principal, { pedidoId: pedido.id });
    }
  }

  /**
   * Uma compra não entra no estoque mais do que foi pedido: a soma das entradas
   * de origem "compra" ligadas ao pedido, para este item (manuais e a do
   * recebimento), não passa da quantidade dos itens do pedido vinculados a ele.
   * Roda com o item já travado, então duas entradas simultâneas não passam juntas.
   *
   * As quantidades vêm de `pedidosParaEntrada`, não de `itens_de_pedido`: quem
   * só tem a tela de Estoque não lê as linhas do pedido (PLU-332).
   */
  private async garantirLimiteDaEntradaDoPedido(tx: Prisma.TransactionClient, pedidoId: string, itemId: string, quantidade: Prisma.Decimal): Promise<void> {
    const [linhas, cabecalho, item] = await Promise.all([
      pedidosParaEntrada(tx, itemId, pedidoId),
      tx.pedidoDeCompra.findUnique({ where: { id: pedidoId }, select: { numero: true } }),
      tx.itemDeEstoque.findUniqueOrThrow({ where: { id: itemId }, select: { unidade: true } }),
    ]);
    if (!cabecalho) throw new RequisicaoInvalida("Pedido de compra não encontrado.", [{ campo: "pedidoId", problema: "Escolha um pedido de compra." }]);
    const problema = problemaDaEntradaDoPedido(linhas[0] ?? null, quantidade, item.unidade, cabecalho.numero);
    if (!problema) return;
    const detalhe = [{ campo: problema.campo, problema: problema.campo === "pedidoId" && !problema.estado ? "O pedido não tem este item." : problema.mensagem }];
    throw problema.estado ? new EstadoInvalido(problema.mensagem, detalhe) : new RequisicaoInvalida(problema.mensagem, detalhe);
  }

  /** Trava os itens de estoque em ordem de id e devolve código e unidade de cada um. */
  private async travarItens(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<Map<string, { codigo: string; unidade: string }>> {
    if (ids.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; codigo: string; unidade: string }[]>`
      SELECT id, codigo, unidade FROM public.itens_de_estoque WHERE id = ANY(${[...ids].sort()}::uuid[]) ORDER BY id FOR UPDATE`;
    return new Map(linhas.map((l) => [l.id, { codigo: l.codigo, unidade: l.unidade }]));
  }

  private destinoDoPedido(pedido: Pedido): VinculoDoMovimento {
    return { destino: pedido.destino as EstoqueDestinoSaida, obraId: pedido.obraId, clientId: pedido.clientId };
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
