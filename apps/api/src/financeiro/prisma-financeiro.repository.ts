import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LIMITE_DA_LISTA_DE_LANCAMENTOS,
  LIMITE_DE_CARDS_POR_COLUNA,
  colunasDoQuadroFinanceiro,
  type AcaoDoLancamento,
  type CategoriaFinanceira,
  type ColunaDoQuadroFinanceiro,
  type CompanyKey,
  type ContaCorrente,
  type CriarContaAPagar,
  type EditarLancamento,
  type Lancamento,
  type LancamentoResumo,
  type ListarLancamentosQuery,
  type ListarLancamentosResposta,
  type NomeDeEventoDoCatalogo,
  type OpcoesDoFinanceiro,
  type QuadroFinanceiro,
  type QuadroFinanceiroQuery,
  type ResumoDosLancamentos,
  type TipoDeLancamento,
  formasDoLancamento,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  acoesPermitidas,
  codigoDoLancamento,
  colunaDoLancamento,
  condicaoDaSituacao,
  emCobranca,
  etapasEmAberto,
  fimDoMesEmManaus,
  inicioDoMesEmManaus,
  numeroDaBusca,
  planejarAcao,
  podeEditar,
  podeExecutar,
  problemaDaEdicao,
  prazoDoLancamento,
  tiposVisiveis,
  type PapelNoFinanceiro,
} from "./financeiro.rules";

const PESSOA = { select: { id: true, name: true } } as const;
const INCLUDE_DO_LANCAMENTO = {
  fornecedor: { select: { id: true, nome: true } },
  categoria: { select: { id: true, codigo: true, nome: true, tipo: true, natureza: true } },
  contaCorrente: { select: { id: true, nome: true } },
  pedidoDeCompra: { select: { id: true, numero: true } },
  criadoPor: PESSOA,
  aprovadoPor: PESSOA,
  pagamentoRegistradoPor: PESSOA,
  recebimentoRegistradoPor: PESSOA,
  conciliadoPor: PESSOA,
  canceladoPor: PESSOA,
} satisfies Prisma.LancamentoInclude;
type LinhaDoLancamento = Prisma.LancamentoGetPayload<{ include: typeof INCLUDE_DO_LANCAMENTO }>;

const DIA_MS = 86_400_000;
const ZERO = new Prisma.Decimal(0);
const pessoa = (u: { id: string; name: string } | null) => (u ? { id: u.id, nome: u.name } : null);
const dia = (data: Date) => diaEmManaus(data);
type NomesDeClientes = Map<string, string>;

/** Ordem da lista: em aberto por vencimento, depois liquidados do mais recente, depois cancelados. */
const ORDEM_EM_ABERTO: Prisma.LancamentoOrderByWithRelationInput[] = [{ vencimento: "asc" }, { createdAt: "asc" }];
const ORDEM_LIQUIDADOS: Prisma.LancamentoOrderByWithRelationInput[] = [{ liquidadoEm: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
const ORDEM_CANCELADOS: Prisma.LancamentoOrderByWithRelationInput[] = [{ canceladoEm: "desc" }];

/**
 * Persistência do Financeiro (PLU-336). Toda leitura já vem recortada pelo RLS
 * (saída de `pagar`, entrada de `receber`); o filtro por tipo daqui é o da tela
 * de Lançamentos, que não mostra à Conciliação o que ela não opera.
 */
@Injectable()
export class PrismaFinanceiroRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  // ------------------------------------------------------------ leitura

  async listar(query: ListarLancamentosQuery, papel: PapelNoFinanceiro, agora: Date): Promise<ListarLancamentosResposta> {
    const tipos = tiposVisiveis(papel, query.tipo);
    const alcance = { saidas: papel.saidas, entradas: papel.entradas };
    const resumo = await this.resumo(papel, query.empresa, agora);
    if (tipos.length === 0) return { itens: [], total: 0, resumo, alcance };

    const where = await this.filtro(query, tipos, agora);
    const condicao = condicaoDaSituacao(query.situacao);
    const { linhas, total } = await this.prisma.comContexto(async (tx) => {
      const total = await tx.lancamento.count({ where });
      if (condicao.cancelado) {
        return { total, linhas: await tx.lancamento.findMany({ where, include: INCLUDE_DO_LANCAMENTO, orderBy: ORDEM_CANCELADOS, take: LIMITE_DA_LISTA_DE_LANCAMENTOS }) };
      }
      // Dois recortes na ordem da tela; o segundo só completa o teto.
      const abertos = await tx.lancamento.findMany({
        where: { AND: [where, { etapa: { in: etapasEmAberto } }] },
        include: INCLUDE_DO_LANCAMENTO,
        orderBy: ORDEM_EM_ABERTO,
        take: LIMITE_DA_LISTA_DE_LANCAMENTOS,
      });
      const resto = LIMITE_DA_LISTA_DE_LANCAMENTOS - abertos.length;
      const liquidados = resto > 0
        ? await tx.lancamento.findMany({ where: { AND: [where, { etapa: { notIn: etapasEmAberto } }] }, include: INCLUDE_DO_LANCAMENTO, orderBy: ORDEM_LIQUIDADOS, take: resto })
        : [];
      return { total, linhas: [...abertos, ...liquidados] };
    });
    const clientes = await this.nomesDeClientes(linhas.map((l) => l.clientId));
    return { itens: linhas.map((l) => this.paraResumo(l, clientes, agora)), total, resumo, alcance };
  }

  async quadro(query: QuadroFinanceiroQuery, papel: PapelNoFinanceiro, agora: Date): Promise<QuadroFinanceiro> {
    const tipos = tiposVisiveis(papel, query.tipo);
    const alcance = { saidas: papel.saidas, entradas: papel.entradas };
    const vazio = (id: ColunaDoQuadroFinanceiro) => ({ id, quantidade: 0, totalEntradas: "0.00", totalSaidas: "0.00", itens: [] });
    if (tipos.length === 0) return { colunas: colunasDoQuadroFinanceiro.map(vazio), alcance };

    const base = await this.filtro(query, tipos, agora);
    const inicioDoMes = inicioDoDiaEmManaus(inicioDoMesEmManaus(agora));
    const porColuna: Record<ColunaDoQuadroFinanceiro, { where: Prisma.LancamentoWhereInput; orderBy: Prisma.LancamentoOrderByWithRelationInput[] }> = {
      preparo: { where: { etapa: { in: ["aberta", "gerada", "nf_emitida", "boleto_gerado"] } }, orderBy: ORDEM_EM_ABERTO },
      aberto: { where: { etapa: { in: ["aprovada", "enviada"] } }, orderBy: ORDEM_EM_ABERTO },
      liquidado: { where: { etapa: { in: ["paga", "recebida"] } }, orderBy: ORDEM_LIQUIDADOS },
      conciliado: { where: { etapa: "conciliada", conciliadoEm: { gte: inicioDoMes } }, orderBy: [{ conciliadoEm: "desc" }] },
    };
    const colunas = await this.prisma.comContexto((tx) => Promise.all(colunasDoQuadroFinanceiro.map(async (id) => {
      const where: Prisma.LancamentoWhereInput = { AND: [base, porColuna[id].where] };
      const [linhas, somas] = await Promise.all([
        tx.lancamento.findMany({ where, include: INCLUDE_DO_LANCAMENTO, orderBy: porColuna[id].orderBy, take: LIMITE_DE_CARDS_POR_COLUNA }),
        tx.lancamento.groupBy({ by: ["tipo"], where, _sum: { valor: true }, _count: { _all: true } }),
      ]);
      const somaDo = (tipo: TipoDeLancamento) => somas.find((s) => s.tipo === tipo);
      return {
        id,
        linhas,
        quantidade: somas.reduce((n, s) => n + s._count._all, 0),
        totalEntradas: (somaDo("entrada")?._sum.valor ?? ZERO).toFixed(2),
        totalSaidas: (somaDo("saida")?._sum.valor ?? ZERO).toFixed(2),
      };
    })));
    const clientes = await this.nomesDeClientes(colunas.flatMap((c) => c.linhas.map((l) => l.clientId)));
    return {
      colunas: colunas.map(({ linhas, ...coluna }) => ({ ...coluna, itens: linhas.map((l) => this.paraResumo(l, clientes, agora)) })),
      alcance,
    };
  }

  async obter(id: string, papel: PapelNoFinanceiro, agora: Date): Promise<Lancamento> {
    const linha = await this.prisma.comContexto((tx) => tx.lancamento.findUnique({ where: { id }, include: INCLUDE_DO_LANCAMENTO }));
    // Fora do tipo que a pessoa opera é como se não existisse (a Conciliação lê pelo RLS, não por aqui).
    if (!linha || !tiposVisiveis(papel, "todos").includes(linha.tipo)) throw new NaoEncontrado("Lançamento não encontrado.");
    const clientes = await this.nomesDeClientes([linha.clientId]);
    return this.paraDetalhe(linha, clientes, papel, agora);
  }

  async opcoes(): Promise<OpcoesDoFinanceiro> {
    const [categorias, contas, fornecedores] = await this.prisma.comContexto((tx) => Promise.all([
      tx.categoriaFinanceira.findMany({ orderBy: [{ companyId: "asc" }, { codigo: "asc" }] }),
      tx.contaCorrente.findMany({ orderBy: [{ companyId: "asc" }, { nome: "asc" }] }),
      tx.fornecedor.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    ]));
    return {
      categorias: categorias.map((c): CategoriaFinanceira => ({
        id: c.id,
        empresa: c.companyId as CompanyKey,
        codigo: c.codigo,
        nome: c.nome,
        tipo: c.tipo,
        natureza: c.natureza,
        grupo: { codigo: c.codigo.split(".").slice(0, 2).join("."), nome: c.grupoNome },
        ativa: c.ativa,
      })),
      contasCorrentes: contas.map((c): ContaCorrente => ({
        id: c.id,
        empresa: c.companyId as CompanyKey,
        nome: c.nome,
        banco: c.banco,
        agencia: c.agencia,
        numero: c.numero,
        saldo: c.saldo?.toFixed(2) ?? null,
        saldoLidoEm: c.saldoLidoEm?.toISOString() ?? null,
        ativa: c.ativa,
      })),
      fornecedores,
      formasDePagamento: [...formasDoLancamento],
    };
  }

  // ------------------------------------------------------------ escrita

  async criarContaAPagar(input: CriarContaAPagar, principal: AuthPrincipal): Promise<string> {
    return this.prisma.comContexto(async (tx) => {
      await this.garantirFornecedor(tx, input.fornecedorId);
      await this.garantirCategoria(tx, input.categoriaId, input.empresa, "saida");
      await this.garantirConta(tx, input.contaCorrenteId, input.empresa);
      const criado = await tx.lancamento.create({
        data: {
          tipo: "saida",
          companyId: input.empresa,
          fornecedorId: input.fornecedorId,
          categoriaId: input.categoriaId,
          contaCorrenteId: input.contaCorrenteId,
          descricao: input.descricao,
          valor: new Prisma.Decimal(input.valor),
          vencimento: inicioDoDiaEmManaus(input.vencimento),
          forma: input.forma,
          observacao: input.observacao ?? null,
          etapa: "aberta",
          origem: "avulsa",
          criadoPorId: principal.id,
        },
        select: { id: true, companyId: true },
      });
      await this.registrar(tx, "financeiro.lancamento.created", criado.id, criado.companyId, principal, { tipo: "saida", origem: "avulsa" });
      return criado.id;
    });
  }

  async editar(id: string, input: EditarLancamento, principal: AuthPrincipal, papel: PapelNoFinanceiro): Promise<void> {
    const campos = Object.entries(input).filter(([, valor]) => valor !== undefined).map(([campo]) => campo).sort();
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id, papel);
      const problema = problemaDaEdicao(atual, campos, papel);
      if (problema?.codigo === "CONFLITO_ESTADO") throw new EstadoInvalido(problema.mensagem);
      if (problema?.codigo === "ACESSO_NEGADO") throw new AcessoNegado(problema.mensagem);
      if (problema) throw new RequisicaoInvalida(problema.mensagem, problema.campo ? [{ campo: problema.campo, problema: problema.mensagem }] : undefined);
      // Edição sem campo nenhum não grava nem gera evento.
      if (campos.length === 0) return;
      if (input.fornecedorId !== undefined) await this.garantirFornecedor(tx, input.fornecedorId);
      if (input.categoriaId !== undefined) await this.garantirCategoria(tx, input.categoriaId, atual.companyId, atual.tipo);
      if (input.contaCorrenteId !== undefined) await this.garantirConta(tx, input.contaCorrenteId, atual.companyId);
      await tx.lancamento.update({
        where: { id },
        data: {
          ...(input.fornecedorId !== undefined ? { fornecedorId: input.fornecedorId } : {}),
          ...(input.categoriaId !== undefined ? { categoriaId: input.categoriaId } : {}),
          ...(input.contaCorrenteId !== undefined ? { contaCorrenteId: input.contaCorrenteId } : {}),
          ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
          ...(input.vencimento !== undefined ? { vencimento: inicioDoDiaEmManaus(input.vencimento) } : {}),
          ...(input.forma !== undefined ? { forma: input.forma } : {}),
          ...(input.observacao !== undefined ? { observacao: input.observacao } : {}),
        },
      });
      await this.registrar(tx, "financeiro.lancamento.updated", id, atual.companyId, principal, { campos });
    });
  }

  /** Uma transação, com o lançamento travado: estado, acesso, gravação e evento. */
  async executarAcao(id: string, acao: AcaoDoLancamento, principal: AuthPrincipal, papel: PapelNoFinanceiro, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id, papel);
      const plano = planejarAcao(atual, acao);
      if ("codigo" in plano) {
        if (plano.codigo === "REQUISICAO_INVALIDA") throw new RequisicaoInvalida(plano.mensagem);
        throw new EstadoInvalido(plano.mensagem);
      }
      if (!podeExecutar(papel, atual, acao.acao)) {
        throw new AcessoNegado(acao.acao === "aprovar" || atual.etapa !== "aberta"
          ? "Só a Gerente do Financeiro aprova a conta ou cancela uma conta aprovada."
          : "Esta ação não está entre as suas.");
      }
      if (plano.tipo === "aprovar") {
        await tx.lancamento.update({ where: { id }, data: { etapa: plano.etapa, aprovadoEm: agora, aprovadoPorId: principal.id } });
        await this.registrar(tx, "financeiro.lancamento.aprovado", id, atual.companyId, principal, {});
      } else {
        await tx.lancamento.update({ where: { id }, data: { canceladoEm: agora, canceladoPorId: principal.id, cancelamentoMotivo: plano.motivo } });
        // O motivo fica no lançamento: texto livre não entra no evento.
        await this.registrar(tx, "financeiro.lancamento.cancelado", id, atual.companyId, principal, { etapa: atual.etapa, comMotivo: true });
      }
    });
  }

  // ------------------------------------------------------------ apoio

  /** SELECT … FOR UPDATE: duas requisições ao mesmo lançamento passam uma de cada vez. */
  private async travar(tx: Prisma.TransactionClient, id: string, papel: PapelNoFinanceiro) {
    const linhas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.lancamentos WHERE id = ${id}::uuid FOR UPDATE`;
    const linha = linhas.length === 0 ? null : await tx.lancamento.findUnique({
      where: { id },
      select: { tipo: true, etapa: true, canceladoEm: true, vencimento: true, companyId: true, origem: true },
    });
    if (!linha || !tiposVisiveis(papel, "todos").includes(linha.tipo)) throw new NaoEncontrado("Lançamento não encontrado.");
    return linha;
  }

  private async garantirFornecedor(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const f = await tx.fornecedor.findUnique({ where: { id }, select: { ativo: true } });
    if (!f) throw new RequisicaoInvalida("Fornecedor não encontrado.", [{ campo: "fornecedorId", problema: "Escolha um fornecedor do cadastro." }]);
    if (!f.ativo) throw new RequisicaoInvalida("Fornecedor inativo.", [{ campo: "fornecedorId", problema: "O fornecedor está inativo." }]);
  }

  private async garantirCategoria(tx: Prisma.TransactionClient, id: string, empresa: string, tipo: TipoDeLancamento): Promise<void> {
    const c = await tx.categoriaFinanceira.findUnique({ where: { id }, select: { companyId: true, tipo: true, ativa: true } });
    const problema = !c ? "Escolha uma categoria do OMIE da empresa."
      : c.companyId !== empresa ? "A categoria é de outra empresa."
      : c.tipo !== (tipo === "saida" ? "despesa" : "receita") ? (tipo === "saida" ? "Conta a pagar usa categoria de despesa." : "Cobrança usa categoria de receita.")
      : !c.ativa ? "A categoria está inativa no OMIE." : null;
    if (problema) throw new RequisicaoInvalida(problema, [{ campo: "categoriaId", problema }]);
  }

  private async garantirConta(tx: Prisma.TransactionClient, id: string, empresa: string): Promise<void> {
    const c = await tx.contaCorrente.findUnique({ where: { id }, select: { companyId: true, ativa: true } });
    const problema = !c ? "Escolha uma conta corrente da empresa."
      : c.companyId !== empresa ? "A conta corrente é de outra empresa."
      : !c.ativa ? "A conta corrente está inativa no OMIE." : null;
    if (problema) throw new RequisicaoInvalida(problema, [{ campo: "contaCorrenteId", problema }]);
  }

  /** O filtro da tela: tipos visíveis, empresa, busca, vencimento e situação. */
  private async filtro(query: ListarLancamentosQuery | QuadroFinanceiroQuery, tipos: TipoDeLancamento[], agora: Date): Promise<Prisma.LancamentoWhereInput> {
    const hoje = inicioDoDiaEmManaus(dia(agora));
    const condicoes: Prisma.LancamentoWhereInput[] = [{ tipo: { in: tipos } }];
    if (query.empresa) condicoes.push({ companyId: query.empresa });

    const situacao = condicaoDaSituacao("situacao" in query ? query.situacao : undefined);
    condicoes.push({ canceladoEm: situacao.cancelado ? { not: null } : null });
    if (situacao.tipos) condicoes.push({ tipo: { in: situacao.tipos } });
    if (situacao.etapas) condicoes.push({ etapa: { in: situacao.etapas } });
    if (situacao.emAberto || situacao.vencido) condicoes.push({ etapa: { in: etapasEmAberto } });
    if (situacao.vencido) condicoes.push({ vencimento: { lt: hoje } });
    if (situacao.omieComErro) condicoes.push({ omieEstado: { in: ["erro", "divergente"] } });

    if (query.vencimento) {
      condicoes.push({ etapa: { in: etapasEmAberto } }, { canceladoEm: null });
      const ate = (dias: number) => new Date(hoje.getTime() + dias * DIA_MS);
      condicoes.push(
        query.vencimento === "vencidos" ? { vencimento: { lt: hoje } }
          : query.vencimento === "hoje" ? { vencimento: { gte: hoje, lt: ate(1) } }
          : query.vencimento === "7" ? { vencimento: { gte: hoje, lt: ate(8) } }
          : { vencimento: { lte: inicioDoDiaEmManaus(fimDoMesEmManaus(agora)) } },
      );
    }

    if (query.busca && query.busca.length > 0) {
      const busca = query.busca;
      const ou: Prisma.LancamentoWhereInput[] = [
        { descricao: { contains: busca, mode: "insensitive" } },
        { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
      ];
      const numero = numeroDaBusca(busca);
      if (numero) ou.push({ numero: numero.numero, ...(numero.tipo ? { tipo: numero.tipo } : {}) });
      const clientes = await this.buscarClientes(busca);
      if (clientes.length > 0) ou.push({ clientId: { in: clientes } });
      condicoes.push({ OR: ou });
    }
    return { AND: condicoes };
  }

  /**
   * Metric cards até o fim do mês corrente, do que está em aberto, recortados
   * pela empresa e pelo que a pessoa alcança.
   */
  private async resumo(papel: PapelNoFinanceiro, empresa: CompanyKey | undefined, agora: Date): Promise<ResumoDosLancamentos> {
    const ateDia = fimDoMesEmManaus(agora);
    const ate = inicioDoDiaEmManaus(ateDia);
    const hoje = inicioDoDiaEmManaus(dia(agora));
    const base: Prisma.LancamentoWhereInput = { canceladoEm: null, etapa: { in: etapasEmAberto }, ...(empresa ? { companyId: empresa } : {}) };
    const tipos = tiposVisiveis(papel, "todos");
    const [ateOFim, vencidos, paraAprovar, contas] = await this.prisma.comContexto((tx) => Promise.all([
      tx.lancamento.groupBy({ by: ["tipo"], where: { ...base, tipo: { in: tipos }, vencimento: { lte: ate } }, _sum: { valor: true }, _count: { _all: true } }),
      tx.lancamento.groupBy({ by: ["tipo"], where: { ...base, tipo: { in: tipos }, vencimento: { lt: hoje } }, _sum: { valor: true } }),
      papel.saidas ? tx.lancamento.count({ where: { ...base, tipo: "saida", etapa: "aberta", vencimento: { lte: ate } } }) : Promise.resolve(0),
      tx.contaCorrente.aggregate({ where: { ativa: true, saldoLidoEm: { not: null }, ...(empresa ? { companyId: empresa } : {}) }, _sum: { saldo: true }, _count: { saldo: true } }),
    ]));
    const soma = (grupos: { tipo: TipoDeLancamento; _sum: { valor: Prisma.Decimal | null } }[], tipo: TipoDeLancamento) =>
      grupos.find((g) => g.tipo === tipo)?._sum.valor ?? ZERO;
    const quantidade = (tipo: TipoDeLancamento) => ateOFim.find((g) => g.tipo === tipo)?._count._all ?? 0;
    const aReceber = soma(ateOFim, "entrada");
    const aPagar = soma(ateOFim, "saida");
    const saldoNasContas = contas._count.saldo > 0 ? (contas._sum.saldo ?? ZERO) : null;
    const vencidoReceber = papel.entradas ? soma(vencidos, "entrada") : null;
    const vencidoPagar = papel.saidas ? soma(vencidos, "saida") : null;
    return {
      ate: ateDia,
      aReceber: papel.entradas ? { valor: aReceber.toFixed(2), quantidade: quantidade("entrada") } : null,
      aPagar: papel.saidas ? { valor: aPagar.toFixed(2), quantidade: quantidade("saida"), paraAprovar } : null,
      saldoProjetado: papel.saidas && papel.entradas
        ? { valor: (saldoNasContas ?? ZERO).add(aReceber).sub(aPagar).toFixed(2), saldoNasContas: saldoNasContas?.toFixed(2) ?? null }
        : null,
      vencidos: {
        valor: (vencidoReceber ?? ZERO).add(vencidoPagar ?? ZERO).toFixed(2),
        aReceber: vencidoReceber?.toFixed(2) ?? null,
        aPagar: vencidoPagar?.toFixed(2) ?? null,
      },
    };
  }

  private async buscarClientes(busca: string): Promise<string[]> {
    if (busca.trim().length < 2) return [];
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM plugga_security.clientes_para_financeiro(${busca}, NULL::uuid[])`);
    return linhas.map((l) => l.id);
  }

  /** O Financeiro não lê `clients` (é do CRM): só id e nome, pela função. */
  private async nomesDeClientes(ids: (string | null)[]): Promise<NomesDeClientes> {
    const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unicos.length === 0) return new Map();
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_financeiro(NULL, ${unicos}::uuid[])`);
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private paraResumo(l: LinhaDoLancamento, clientes: NomesDeClientes, agora: Date): LancamentoResumo {
    const favorecido = l.tipo === "saida"
      ? { tipo: "fornecedor" as const, id: l.fornecedor?.id ?? l.fornecedorId ?? "", nome: l.fornecedor?.nome ?? "Fornecedor" }
      : { tipo: "cliente" as const, id: l.clientId ?? "", nome: (l.clientId && clientes.get(l.clientId)) || "Cliente" };
    return {
      id: l.id,
      tipo: l.tipo,
      codigo: codigoDoLancamento(l.tipo, l.numero),
      empresa: l.companyId as CompanyKey,
      etapa: l.etapa,
      coluna: colunaDoLancamento(l.etapa),
      emCobranca: emCobranca(l, agora),
      cancelado: l.canceladoEm !== null,
      favorecido,
      categoria: l.categoria,
      contaCorrente: l.contaCorrente,
      descricao: l.descricao,
      valor: l.valor.toFixed(2),
      vencimento: dia(l.vencimento),
      competencia: l.competencia,
      prazo: prazoDoLancamento(l, agora),
      liquidadoEm: l.liquidadoEm ? dia(l.liquidadoEm) : null,
      // Os anexos chegam com a PLU-337.
      anexos: 0,
      omie: { estado: l.omieEstado, codigo: l.omieCodigo, motivo: l.omieMotivo },
      origem: { tipo: l.origem, pedidoDeCompra: l.pedidoDeCompra },
      createdAt: l.createdAt.toISOString(),
    };
  }

  private paraDetalhe(l: LinhaDoLancamento, clientes: NomesDeClientes, papel: PapelNoFinanceiro, agora: Date): Lancamento {
    const registro = (por: { id: string; name: string } | null, em: Date | null) => (em ? { por: pessoa(por), em: em.toISOString() } : null);
    return {
      ...this.paraResumo(l, clientes, agora),
      forma: l.forma,
      observacao: l.observacao,
      marcos: {
        criado: { por: pessoa(l.criadoPor), em: l.createdAt.toISOString() },
        aprovado: registro(l.aprovadoPor, l.aprovadoEm),
        pago: l.pagoEm && l.pagamentoRegistradoEm
          ? { por: pessoa(l.pagamentoRegistradoPor), em: l.pagamentoRegistradoEm.toISOString(), pagoEm: dia(l.pagoEm) }
          : null,
        recebido: l.recebidoEm && l.recebimentoRegistradoEm && l.valorRecebido
          ? { por: pessoa(l.recebimentoRegistradoPor), em: l.recebimentoRegistradoEm.toISOString(), recebidoEm: dia(l.recebidoEm), valor: l.valorRecebido.toFixed(2) }
          : null,
        conciliado: registro(l.conciliadoPor, l.conciliadoEm),
        cancelado: l.canceladoEm ? { por: pessoa(l.canceladoPor), em: l.canceladoEm.toISOString(), motivo: l.cancelamentoMotivo ?? "" } : null,
      },
      acoesPermitidas: acoesPermitidas(l, papel),
      podeEditar: podeEditar(l, papel),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: NomeDeEventoDoCatalogo,
    entityId: string,
    companyId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType: "lancamento",
      entityId,
      companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}

