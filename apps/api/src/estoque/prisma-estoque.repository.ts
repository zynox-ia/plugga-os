import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LIMITE_DE_MOVIMENTACOES,
  listarItensDeEstoqueQuerySchema,
  type CompanyKey,
  type CriarItemDeEstoque,
  type EditarItemDeEstoque,
  type ItemDeEstoque,
  type ItemDeEstoqueNaLista,
  type ListarItensDeEstoqueQuery,
  type ListarItensDeEstoqueResposta,
  type ListarMovimentacoesQuery,
  type ListarMovimentacoesResposta,
  type Movimentacao,
  type NomeDeEventoDoCatalogo,
  type ObraDeCompra,
  type PedidoParaEntrada,
  type RegistrarMovimentacao,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, fimDoDiaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { D, aceitaEntradaDoPedido, diaValido, faltaEntrar, origemOuDestino, proximoCodigo, saldoParaContrato, ultimas8Semanas } from "./estoque.rules";
import { MovimentosDeEstoque, diaComoData, pedidosParaEntrada } from "./movimentos-de-estoque";

const PESSOA = { select: { id: true, name: true } } as const;
const INCLUDE_DA_MOVIMENTACAO = {
  item: { select: { id: true, codigo: true, nome: true, unidade: true, companyId: true } },
  obra: { select: { id: true, nome: true } },
  pedido: { select: { id: true, numero: true } },
  registradaPor: PESSOA,
} satisfies Prisma.MovimentacaoDeEstoqueInclude;
type LinhaDaMovimentacao = Prisma.MovimentacaoDeEstoqueGetPayload<{ include: typeof INCLUDE_DA_MOVIMENTACAO }>;

const SELECT_DO_ITEM = {
  id: true, companyId: true, codigo: true, nome: true, categoria: true, unidade: true, estoqueMinimo: true,
  emEstoque: true, reservado: true, custoMedio: true, ativo: true, ultimaMovimentacaoEm: true,
} satisfies Prisma.ItemDeEstoqueSelect;
type LinhaDoItem = Prisma.ItemDeEstoqueGetPayload<{ select: typeof SELECT_DO_ITEM }>;

const DIA_MS = 86_400_000;
const pessoa = (u: { id: string; name: string } | null) => (u ? { id: u.id, nome: u.name } : null);
/** O dia de Manaus de um instante gravado. */
const dia = (data: Date) => diaEmManaus(data);

/**
 * Persistência do Estoque (PLU-332). A escrita do saldo passa só por
 * `MovimentosDeEstoque`, na transação de cada operação.
 */
@Injectable()
export class PrismaEstoqueRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
    @Inject(MovimentosDeEstoque) private readonly movimentos: MovimentosDeEstoque,
  ) {}

  // ------------------------------------------------------------ itens

  async listar(entrada: ListarItensDeEstoqueQuery): Promise<ListarItensDeEstoqueResposta> {
    const query = listarItensDeEstoqueQuerySchema.parse(entrada);
    const where: Prisma.ItemDeEstoqueWhereInput = {
      ...(query.empresa ? { companyId: query.empresa } : {}),
      ...(query.categoria ? { categoria: query.categoria } : {}),
      ...(query.situacao === "ativos" ? { ativo: true } : query.situacao === "inativos" ? { ativo: false } : {}),
      ...(query.busca ? { OR: [{ codigo: { contains: query.busca, mode: "insensitive" } }, { nome: { contains: query.busca, mode: "insensitive" } }] } : {}),
    };
    // O cadastro é pequeno (centenas): o saldo e a situação são calculados aqui, sobre as colunas acumuladas.
    const linhas = await this.prisma.comContexto((tx) => tx.itemDeEstoque.findMany({ where, select: SELECT_DO_ITEM, orderBy: [{ nome: "asc" }] }));
    const todos = linhas.map(paraItemNaLista);
    const resumo = {
      itens: todos.length,
      normais: todos.filter((i) => i.saldo.situacao === "normal").length,
      abaixoDoMinimo: todos.filter((i) => i.saldo.situacao === "abaixo_do_minimo").length,
      zerados: todos.filter((i) => i.saldo.situacao === "zerado").length,
      comReserva: todos.filter((i) => D(i.saldo.reservado).gt(0)).length,
      valorEmEstoque: todos.reduce((total, i) => total.add(i.saldo.valor), D(0)).toFixed(2),
    };
    const itens = query.saldo === "todos" ? todos
      : query.saldo === "com_reserva" ? todos.filter((i) => D(i.saldo.reservado).gt(0))
      : todos.filter((i) => i.saldo.situacao === query.saldo);
    return { itens, resumo };
  }

  async obter(id: string, agora: Date): Promise<ItemDeEstoque> {
    const desde = diaComoData(diaEmManaus(new Date(agora.getTime() - 63 * DIA_MS)));
    const linha = await this.prisma.comContexto((tx) => tx.itemDeEstoque.findUnique({
      where: { id },
      select: {
        ...SELECT_DO_ITEM, observacoes: true, createdAt: true, updatedAt: true, criadoPor: PESSOA,
        reservas: {
          where: { estado: "ativa" },
          orderBy: { reservadaEm: "asc" },
          select: {
            id: true, quantidade: true, reservadaEm: true, reservadaPor: PESSOA,
            pedido: { select: { id: true, numero: true, titulo: true, etapa: true, destino: true, clientId: true, obra: { select: { nome: true } } } },
          },
        },
        movimentacoes: { where: { data: { gte: desde } }, select: { tipo: true, data: true, quantidade: true } },
        _count: { select: { movimentacoes: true } },
      },
    }));
    if (!linha) throw new NaoEncontrado("Item de estoque não encontrado.");
    const ultimas = await this.prisma.comContexto((tx) => tx.movimentacaoDeEstoque.findMany({
      where: { itemId: id }, include: INCLUDE_DA_MOVIMENTACAO, orderBy: { registradaEm: "desc" }, take: 10,
    }));
    const clientes = await this.nomesDeClientes([
      ...linha.reservas.flatMap((r) => (r.pedido.clientId ? [r.pedido.clientId] : [])),
      ...ultimas.flatMap((m) => (m.clientId ? [m.clientId] : [])),
    ]);
    return {
      ...paraItemNaLista(linha),
      observacoes: linha.observacoes,
      ultimas8Semanas: ultimas8Semanas(linha.movimentacoes.map((m) => ({ tipo: m.tipo, data: dia(m.data), quantidade: m.quantidade })), agora),
      reservas: linha.reservas.map((r) => ({
        id: r.id,
        quantidade: r.quantidade.toFixed(3),
        pedido: { id: r.pedido.id, numero: r.pedido.numero, titulo: r.pedido.titulo, etapa: r.pedido.etapa },
        destino: r.pedido.destino === "obra" ? `Obra ${r.pedido.obra?.nome ?? ""}`.trim()
          : r.pedido.destino === "cliente" ? `Cliente ${clientes.get(r.pedido.clientId ?? "") ?? ""}`.trim() : "Interno",
        reservadaEm: r.reservadaEm.toISOString(),
        reservadaPor: pessoa(r.reservadaPor),
      })),
      ultimasMovimentacoes: ultimas.map((m) => paraMovimentacao(m, clientes)),
      podeInativar: linha.reservas.length === 0,
      podeTrocarEmpresa: linha._count.movimentacoes === 0 && (await this.prisma.comContexto((tx) => podeTrocarEmpresa(tx, id))),
      criadoPor: pessoa(linha.criadoPor),
      createdAt: linha.createdAt.toISOString(),
      updatedAt: linha.updatedAt.toISOString(),
    };
  }

  async criar(input: CriarItemDeEstoque, principal: AuthPrincipal, agora: Date): Promise<string> {
    return this.comCodigoUnico(() => this.prisma.comContexto(async (tx) => {
      // Gerar o código sob trava por empresa: dois cadastros simultâneos não pegam o mesmo EST-.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`estoque.codigo.${input.empresa}`}))`;
      const codigo = input.codigo ?? proximoCodigo((await tx.itemDeEstoque.findMany({
        where: { companyId: input.empresa, codigo: { startsWith: "EST-" } }, select: { codigo: true },
      })).map((linha) => linha.codigo));
      const item = await tx.itemDeEstoque.create({
        data: {
          companyId: input.empresa, codigo, nome: input.nome, categoria: input.categoria, unidade: input.unidade,
          estoqueMinimo: input.estoqueMinimo, observacoes: input.observacoes ?? null, criadoPorId: principal.id,
        },
        select: { id: true },
      });
      await this.registrar(tx, "estoque.item.created", "item_de_estoque", item.id, input.empresa, principal, {
        campos: Object.keys(input).filter((c) => (input as Record<string, unknown>)[c] !== undefined).sort(),
      });
      if (input.saldoInicial) {
        await this.movimentos.aplicar(tx, {
          itemId: item.id,
          movimento: { tipo: "entrada", quantidade: D(input.saldoInicial), custoUnitario: D(input.custoUnitario!) },
          data: diaComoData(diaEmManaus(agora)),
          vinculo: { origem: "saldo_inicial" },
          observacao: null,
          exigirAtivo: true,
        }, principal, agora);
      }
      return item.id;
    }));
  }

  async editar(id: string, input: EditarItemDeEstoque, principal: AuthPrincipal): Promise<void> {
    const campos = Object.entries(input).filter(([, v]) => v !== undefined).map(([c]) => c).sort();
    if (campos.length === 0) return;
    await this.comCodigoUnico(() => this.prisma.comContexto(async (tx) => {
      // Trava o item antes de conferir: uma movimentação ou um vínculo em curso termina antes da contagem.
      const travado = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.itens_de_estoque WHERE id = ${id}::uuid FOR UPDATE`;
      if (travado.length === 0) throw new NaoEncontrado("Item de estoque não encontrado.");
      const atual = await tx.itemDeEstoque.findUniqueOrThrow({ where: { id }, select: { companyId: true } });
      if (input.empresa && input.empresa !== atual.companyId && !(await podeTrocarEmpresa(tx, id))) {
        throw new EstadoInvalido("A empresa do item só muda enquanto ele não tem movimentação nem pedido vinculado.");
      }
      await tx.itemDeEstoque.update({
        where: { id },
        data: {
          ...(input.empresa !== undefined ? { companyId: input.empresa } : {}),
          ...(input.codigo !== undefined ? { codigo: input.codigo } : {}),
          ...(input.nome !== undefined ? { nome: input.nome } : {}),
          ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
          ...(input.unidade !== undefined ? { unidade: input.unidade } : {}),
          ...(input.estoqueMinimo !== undefined ? { estoqueMinimo: input.estoqueMinimo } : {}),
          ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
        },
      });
      await this.registrar(tx, "estoque.item.updated", "item_de_estoque", id, input.empresa ?? atual.companyId, principal, { campos });
    }));
  }

  /** Inativar não vale com reserva ativa: o material está prometido a um pedido. Idempotente. */
  async mudarSituacao(id: string, ativo: boolean, principal: AuthPrincipal): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const travado = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.itens_de_estoque WHERE id = ${id}::uuid FOR UPDATE`;
      if (travado.length === 0) throw new NaoEncontrado("Item de estoque não encontrado.");
      const item = await tx.itemDeEstoque.findUniqueOrThrow({ where: { id }, select: { ativo: true, reservado: true, companyId: true } });
      if (item.ativo === ativo) return;
      if (!ativo && item.reservado.gt(0)) throw new EstadoInvalido("O item tem reserva ativa de um pedido de compra. Libere ou baixe a reserva antes de inativar.");
      await tx.itemDeEstoque.update({ where: { id }, data: { ativo } });
      await this.registrar(tx, ativo ? "estoque.item.reactivated" : "estoque.item.inactivated", "item_de_estoque", id, item.companyId, principal, {});
    });
  }

  // ------------------------------------------------------------ movimentações

  async registrarMovimentacao(input: RegistrarMovimentacao, principal: AuthPrincipal, agora: Date): Promise<string> {
    const diaDoMovimento = input.data ?? diaEmManaus(agora);
    if (!diaValido(diaDoMovimento, agora)) throw new RequisicaoInvalida("A data da movimentação não pode ser futura.", [{ campo: "data", problema: "Use hoje ou um dia anterior." }]);
    const movimento = input.tipo === "entrada"
      ? { tipo: "entrada" as const, quantidade: D(input.quantidade), custoUnitario: D(input.custoUnitario) }
      : input.tipo === "saida"
        ? { tipo: "saida" as const, quantidade: D(input.quantidade) }
        : { tipo: "ajuste" as const, ...(input.saldoContado !== undefined ? { saldoContado: D(input.saldoContado) } : { quantidade: D(input.quantidade!) }) };
    const vinculo = input.tipo === "entrada"
      ? { origem: input.origem.tipo, pedidoId: input.origem.pedidoId ?? null }
      : input.tipo === "saida"
        ? { destino: input.destino.tipo, obraId: input.destino.obraId ?? null, clientId: input.destino.clientId ?? null, area: input.destino.area ?? null }
        : {};
    try {
      return await this.prisma.comContexto(async (tx) => {
        const item = await tx.itemDeEstoque.findUnique({ where: { id: input.itemId }, select: { companyId: true } });
        if (!item) throw new NaoEncontrado("Item de estoque não encontrado.");
        if ("obraId" in vinculo && vinculo.obraId) {
          const obra = await tx.obra.findUnique({ where: { id: vinculo.obraId }, select: { companyId: true, ativa: true } });
          if (!obra || !obra.ativa) throw new RequisicaoInvalida("Obra não encontrada ou inativa.", [{ campo: "obraId", problema: "Escolha uma obra ativa." }]);
          if (obra.companyId !== item.companyId) throw new RequisicaoInvalida("A obra é de outra empresa.", [{ campo: "obraId", problema: "Escolha uma obra da empresa do item." }]);
        }
        if ("pedidoId" in vinculo && vinculo.pedidoId) {
          const pedido = await tx.pedidoDeCompra.findUnique({ where: { id: vinculo.pedidoId }, select: { companyId: true } });
          if (!pedido || pedido.companyId !== item.companyId) throw new RequisicaoInvalida("Pedido de compra não encontrado nesta empresa.", [{ campo: "pedidoId", problema: "Escolha um pedido da empresa do item." }]);
        }
        const criada = await this.movimentos.aplicar(tx, {
          itemId: input.itemId, movimento, data: diaComoData(diaDoMovimento), vinculo, observacao: input.observacao ?? null, exigirAtivo: true,
        }, principal, agora);
        return criada.id;
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
        throw new RequisicaoInvalida("Cliente não encontrado.", [{ campo: "clientId", problema: "Escolha um cliente do cadastro." }]);
      }
      throw erro;
    }
  }

  async listarMovimentacoes(query: ListarMovimentacoesQuery, agora: Date): Promise<ListarMovimentacoesResposta> {
    const hoje = diaEmManaus(agora);
    const [de, ate] = query.periodo === "mes" ? [`${hoje.slice(0, 8)}01`, hoje]
      : query.periodo === "7" ? [diaEmManaus(new Date(agora.getTime() - 6 * DIA_MS)), hoje]
      : query.de || query.ate ? [query.de ?? "2000-01-01", query.ate ?? hoje]
      : [diaEmManaus(new Date(agora.getTime() - 29 * DIA_MS)), hoje];
    const where: Prisma.MovimentacaoDeEstoqueWhereInput = {
      data: { gte: inicioDoDiaEmManaus(de), lte: fimDoDiaEmManaus(ate) },
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      item: {
        ...(query.empresa ? { companyId: query.empresa } : {}),
        ...(query.busca ? { OR: [{ codigo: { contains: query.busca, mode: "insensitive" } }, { nome: { contains: query.busca, mode: "insensitive" } }] } : {}),
      },
    };
    const [linhas, total, porTipo] = await this.prisma.comContexto((tx) => Promise.all([
      tx.movimentacaoDeEstoque.findMany({ where, include: INCLUDE_DA_MOVIMENTACAO, orderBy: [{ data: "desc" }, { registradaEm: "desc" }], take: LIMITE_DE_MOVIMENTACOES }),
      tx.movimentacaoDeEstoque.count({ where }),
      tx.movimentacaoDeEstoque.findMany({ where: { ...where, tipo: { in: ["entrada", "saida"] } }, select: { tipo: true, quantidade: true, custoUnitario: true, custoMedioNoMomento: true } }),
    ]));
    const contagens = await this.prisma.comContexto((tx) => tx.movimentacaoDeEstoque.groupBy({ by: ["tipo"], where, _count: { _all: true } }));
    const contar = (tipo: string) => contagens.find((c) => c.tipo === tipo)?._count._all ?? 0;
    const valorDe = (tipo: "entrada" | "saida") => porTipo
      .filter((m) => m.tipo === tipo)
      .reduce((soma, m) => soma.add(m.quantidade.mul((tipo === "entrada" ? m.custoUnitario : m.custoMedioNoMomento) ?? 0)), D(0))
      .toFixed(2);
    const clientes = await this.nomesDeClientes(linhas.flatMap((m) => (m.clientId ? [m.clientId] : [])));
    const porDia = new Map<string, Movimentacao[]>();
    for (const linha of linhas) {
      const chave = dia(linha.data);
      porDia.set(chave, [...(porDia.get(chave) ?? []), paraMovimentacao(linha, clientes)]);
    }
    return {
      dias: [...porDia.entries()].map(([d, movimentacoes]) => ({ dia: d, movimentacoes })),
      resumo: {
        entradas: { quantidade: contar("entrada"), valor: valorDe("entrada") },
        saidas: { quantidade: contar("saida"), valor: valorDe("saida") },
        ajustes: { quantidade: contar("ajuste") },
        reservas: { quantidade: contar("reserva") },
        liberacoes: { quantidade: contar("liberacao") },
      },
      total,
    };
  }

  async movimentacao(id: string): Promise<Movimentacao> {
    const linha = await this.prisma.comContexto((tx) => tx.movimentacaoDeEstoque.findUnique({ where: { id }, include: INCLUDE_DA_MOVIMENTACAO }));
    if (!linha) throw new NaoEncontrado("Movimentação não encontrada.");
    return paraMovimentacao(linha, await this.nomesDeClientes(linha.clientId ? [linha.clientId] : []));
  }

  // ------------------------------------------------------------ opções

  async obras(): Promise<ObraDeCompra[]> {
    const obras = await this.prisma.comContexto((tx) => tx.obra.findMany({ where: { ativa: true }, select: { id: true, nome: true, companyId: true, clientId: true }, orderBy: { nome: "asc" } }));
    const clientes = await this.nomesDeClientes(obras.flatMap((o) => (o.clientId ? [o.clientId] : [])));
    return obras.map((o) => ({ id: o.id, empresa: o.companyId as CompanyKey, nome: o.nome, cliente: o.clientId ? { id: o.clientId, nome: clientes.get(o.clientId) ?? "Cliente" } : null }));
  }

  async buscarClientes(busca: string): Promise<{ id: string; nome: string }[]> {
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_compras(${busca}, NULL::uuid[])`);
    return linhas.map((l) => ({ id: l.id, nome: l.name }));
  }

  /** Pedidos que ainda aceitam entrada do item, para a origem "Compra" do registro de movimentação. */
  async pedidosParaEntrada(itemId: string): Promise<PedidoParaEntrada[]> {
    const linhas = await this.prisma.comContexto(async (tx) => {
      const item = await tx.itemDeEstoque.findUnique({ where: { id: itemId }, select: { id: true } });
      if (!item) throw new NaoEncontrado("Item de estoque não encontrado.");
      return pedidosParaEntrada(tx, itemId, null);
    });
    return linhas.filter(aceitaEntradaDoPedido).map((p) => ({
      id: p.id, numero: p.numero, titulo: p.titulo, etapa: p.etapa,
      pedida: p.pedida.toFixed(3), recebida: p.recebida.toFixed(3), falta: faltaEntrar(p).toFixed(3),
    }));
  }

  /** Para o "Abrir pedido de compra": empresa, nome, unidade e quanto falta para o mínimo. */
  async paraReposicao(id: string): Promise<{ empresa: CompanyKey; codigo: string; nome: string; unidade: string; ativo: boolean; falta: string }> {
    const item = await this.prisma.comContexto((tx) => tx.itemDeEstoque.findUnique({ where: { id }, select: SELECT_DO_ITEM }));
    if (!item) throw new NaoEncontrado("Item de estoque não encontrado.");
    return { empresa: item.companyId as CompanyKey, codigo: item.codigo, nome: item.nome, unidade: item.unidade, ativo: item.ativo, falta: saldoParaContrato(item).faltaParaOMinimo };
  }

  // ------------------------------------------------------------ apoio

  private async comCodigoUnico<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito("Já existe um item com este código nesta empresa.", [{ campo: "codigo", problema: "Use outro código ou deixe em branco para gerar." }]);
      }
      throw erro;
    }
  }

  private async nomesDeClientes(ids: string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_compras(NULL, ${unicos}::uuid[])`);
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private registrar(tx: Prisma.TransactionClient, eventName: NomeDeEventoDoCatalogo, entityType: string, entityId: string, companyId: string, principal: AuthPrincipal, payload: Record<string, unknown>): Promise<void> {
    return this.auditoria.append(tx, {
      eventName, entityType, entityId, companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id, payload, occurredAt: new Date(),
    });
  }
}

/**
 * A empresa do item só muda sem movimentação e sem pedido vinculado. A mesma
 * conta para a ficha (`podeTrocarEmpresa`) e para a edição. Os vínculos vêm da
 * função restrita do banco: quem só tem Estoque não lê `itens_de_pedido`, e o
 * desconhecido (NULL) conta como vinculado.
 */
async function podeTrocarEmpresa(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const [movimentacoes, [vinculos]] = await Promise.all([
    tx.movimentacaoDeEstoque.count({ where: { itemId: id } }),
    tx.$queryRaw<{ n: number | null }[]>`SELECT plugga_security.vinculos_do_item_de_estoque(${id}::uuid) AS n`,
  ]);
  return movimentacoes === 0 && vinculos?.n === 0;
}

export function paraItemNaLista(linha: LinhaDoItem): ItemDeEstoqueNaLista {
  return {
    id: linha.id,
    empresa: linha.companyId as CompanyKey,
    codigo: linha.codigo,
    nome: linha.nome,
    categoria: linha.categoria,
    unidade: linha.unidade,
    estoqueMinimo: linha.estoqueMinimo.toFixed(3),
    ativo: linha.ativo,
    saldo: saldoParaContrato(linha),
    ultimaMovimentacaoEm: linha.ultimaMovimentacaoEm?.toISOString() ?? null,
  };
}

export function paraMovimentacao(m: LinhaDaMovimentacao, clientes: ReadonlyMap<string, string>): Movimentacao {
  const cliente = m.clientId ? { id: m.clientId, nome: clientes.get(m.clientId) ?? "Cliente" } : null;
  const custo = m.tipo === "entrada" ? m.custoUnitario : m.custoMedioNoMomento;
  const valoravel = m.tipo === "entrada" || m.tipo === "saida" || m.tipo === "ajuste";
  return {
    id: m.id,
    tipo: m.tipo,
    item: { id: m.item.id, codigo: m.item.codigo, nome: m.item.nome, unidade: m.item.unidade, empresa: m.item.companyId as CompanyKey },
    data: dia(m.data),
    quantidade: m.quantidade.toFixed(3),
    custoUnitario: m.custoUnitario?.toFixed(2) ?? null,
    valor: valoravel && custo ? m.quantidade.abs().mul(custo).toFixed(2) : null,
    origem: m.origem,
    destino: m.destino,
    obra: m.obra ? { id: m.obra.id, nome: m.obra.nome } : null,
    cliente,
    area: m.area,
    pedido: m.pedido ? { id: m.pedido.id, numero: m.pedido.numero } : null,
    origemOuDestino: origemOuDestino({ tipo: m.tipo, origem: m.origem, destino: m.destino, obra: m.obra, cliente, area: m.area, pedido: m.pedido }),
    observacao: m.observacao,
    saldoDepois: m.saldoDepois.toFixed(3),
    registradaPor: pessoa(m.registradaPor),
    registradaEm: m.registradaEm.toISOString(),
  };
}

