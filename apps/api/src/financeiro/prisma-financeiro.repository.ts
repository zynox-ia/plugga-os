import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LIMITE_DA_LISTA_DE_LANCAMENTOS,
  LIMITE_DE_CARDS_POR_COLUNA,
  colunasDoQuadroFinanceiro,
  type AcaoDoLancamento,
  type ColunaDoQuadroFinanceiro,
  type CompanyKey,
  type CriarCobranca,
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
  type TipoDeAnexo,
  type TipoDeLancamento,
  formasDoLancamento,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { linhaDoTempo, nomePadronizadoDoComprovante } from "./financeiro.detalhe";
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
  outraPernaDaTransferencia,
  codigoDaTransferencia,
  ehTransferencia,
  origensPagasSemAprovacao,
  pagoSemAprovacao,
  planejarAcao,
  podeEditar,
  podeExecutar,
  problemaDaEdicao,
  prazoDoLancamento,
  tiposVisiveis,
  pendenciasDoLancamento,
  type AnexosAtuais,
  type PapelNoFinanceiro,
  type Plano,
} from "./financeiro.rules";
import { paraCategoria, paraConta } from "./prisma-cadastros-do-financeiro.repository";
import { ReflexosDoLancamento, type MudancaDoLancamento } from "./reflexo-do-lancamento";

/** O fato de cada ação de etapa, para os conectores. */
const MUDANCA_DO_PLANO: Record<Plano["tipo"], MudancaDoLancamento> = {
  aprovar: "aprovado",
  cancelar: "cancelado",
  corrigir_valor: "valor_corrigido",
  registrar_nf: "nf_registrada",
  registrar_boleto: "boleto_registrado",
  registrar_envio: "enviado",
  registrar_cobranca: "cobranca_registrada",
  registrar_pagamento: "pago",
  registrar_recebimento: "recebido",
};

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
  // A contagem dos anexos atuais, para o card.
  _count: { select: { anexos: { where: { substituidoEm: null } }, ucs: true } },
  // A perna de uma transferência entre contas (C6): as duas contas e as duas pernas.
  transferencia: { select: { id: true, numero: true, contaOrigem: { select: { id: true, nome: true } }, contaDestino: { select: { id: true, nome: true } }, pernas: { select: { id: true, tipo: true } } } },
} satisfies Prisma.LancamentoInclude;
type LinhaDoLancamento = Prisma.LancamentoGetPayload<{ include: typeof INCLUDE_DO_LANCAMENTO }>;

/** O detalhe da ficha: o resumo, os anexos, o histórico e os marcos da entrada. */
const INCLUDE_DO_DETALHE = {
  ...INCLUDE_DO_LANCAMENTO,
  nfRegistradaPor: PESSOA,
  boletoRegistradoPor: PESSOA,
  enviadoPor: PESSOA,
  anexos: { include: { enviadoPor: PESSOA, substituidoPor: PESSOA }, orderBy: { enviadoEm: "desc" } },
  historico: { include: { por: PESSOA }, orderBy: { em: "desc" }, take: 200 },
  ucs: { select: { consumerUnitId: true } },
} satisfies Prisma.LancamentoInclude;
type LinhaDoDetalhe = Prisma.LancamentoGetPayload<{ include: typeof INCLUDE_DO_DETALHE }>;

/** Os anexos de que as transições dependem (comprovante e boleto atuais, e se o boleto é novo). */
async function anexosAtuais(tx: Prisma.TransactionClient, lancamentoId: string): Promise<AnexosAtuais> {
  const [atuais, lancamento, correcao] = await Promise.all([
    tx.anexoDeLancamento.findMany({ where: { lancamentoId, substituidoEm: null, tipo: { in: ["comprovante", "boleto"] } }, select: { tipo: true, enviadoEm: true } }),
    tx.lancamento.findUnique({ where: { id: lancamentoId }, select: { boletoRegistradoEm: true } }),
    tx.historicoDeLancamento.findFirst({ where: { lancamentoId, tipo: "valor_corrigido" }, orderBy: { em: "desc" }, select: { em: true } }),
  ]);
  const boleto = atuais.find((a) => a.tipo === "boleto");
  const referencia = Math.max(lancamento?.boletoRegistradoEm?.getTime() ?? 0, correcao?.em.getTime() ?? 0);
  return { comprovante: atuais.some((a) => a.tipo === "comprovante"), boleto: Boolean(boleto), boletoNovo: Boolean(boleto && boleto.enviadoEm.getTime() > referencia) };
}

const DIA_MS = 86_400_000;

/** O arquivo de um anexo no armazenamento. */
export type ArquivoDoLancamento = { chave: string; nome: string; tamanho: number; tipo: string };
const ZERO = new Prisma.Decimal(0);
const pessoa = (u: { id: string; name: string } | null) => (u ? { id: u.id, nome: u.name } : null);
const dia = (data: Date) => diaEmManaus(data);
type NomesDeClientes = Map<string, string>;
type PedidosDasContas = Map<string, { id: string; numero: number; valor: string }>;

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
    // Sem ninguém inscrito (nos testes do núcleo, por exemplo), nada é refletido.
    @Optional() @Inject(ReflexosDoLancamento) private readonly reflexos: ReflexosDoLancamento = new ReflexosDoLancamento(),
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
    const [clientes, pedidos] = await Promise.all([this.nomesDeClientes(linhas.map((l) => l.clientId)), this.pedidosDasContas(linhas)]);
    return { itens: linhas.map((l) => this.paraResumo(l, clientes, agora, pedidos)), total, resumo, alcance };
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
    const todas = colunas.flatMap((c) => c.linhas);
    const [clientes, pedidos] = await Promise.all([this.nomesDeClientes(todas.map((l) => l.clientId)), this.pedidosDasContas(todas)]);
    return {
      colunas: colunas.map(({ linhas, ...coluna }) => ({ ...coluna, itens: linhas.map((l) => this.paraResumo(l, clientes, agora, pedidos)) })),
      alcance,
    };
  }

  async obter(id: string, papel: PapelNoFinanceiro, agora: Date): Promise<Lancamento> {
    const linha = await this.prisma.comContexto((tx) => tx.lancamento.findUnique({ where: { id }, include: INCLUDE_DO_DETALHE }));
    // Fora do tipo que a pessoa opera é como se não existisse (a Conciliação lê pelo RLS, não por aqui).
    if (!linha || !tiposVisiveis(papel, "todos").includes(linha.tipo)) throw new NaoEncontrado("Lançamento não encontrado.");
    const [clientes, ucs, pedidos] = await Promise.all([
      this.nomesDeClientes([linha.clientId]), this.ucsDosClientes(linha.clientId ? [linha.clientId] : []), this.pedidosDasContas([linha]),
    ]);
    return this.paraDetalhe(linha, clientes, ucs, papel, agora, pedidos);
  }

  /**
   * O saldo de cada conta ativa (PLU-339, C4): o saldo inicial (o fim do dia dele) mais todo o
   * LIQUIDADO depois desse dia (pago, recebido e conciliado), porque é o pagamento, e não a
   * conciliação, que move o dinheiro. `saldoConciliado`: só o conferido com o extrato, para a
   * Conciliação mostrar a diferença. Sem saldo inicial, os dois são nulos.
   */
  private async saldosDasContas(tx: Prisma.TransactionClient, empresa?: CompanyKey): Promise<{ id: string; saldo: Prisma.Decimal | null; saldoConciliado: Prisma.Decimal | null }[]> {
    return tx.$queryRaw<{ id: string; saldo: Prisma.Decimal | null; saldoConciliado: Prisma.Decimal | null }[]>`
      SELECT c.id,
        CASE WHEN c.saldo_inicial IS NULL THEN NULL ELSE c.saldo_inicial + COALESCE(SUM(
          CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor) ELSE -l.valor END
        ) FILTER (WHERE l.id IS NOT NULL), 0) END AS saldo,
        CASE WHEN c.saldo_inicial IS NULL THEN NULL ELSE c.saldo_inicial + COALESCE(SUM(
          CASE WHEN l.tipo = 'entrada' THEN COALESCE(l.valor_recebido, l.valor) ELSE -l.valor END
        ) FILTER (WHERE l.etapa = 'conciliada'), 0) END AS "saldoConciliado"
      FROM public.contas_correntes c
      LEFT JOIN public.lancamentos l ON l.conta_corrente_id = c.id AND l.etapa IN ('paga', 'recebida', 'conciliada') AND l.cancelado_em IS NULL
        AND c.saldo_inicial_em IS NOT NULL AND l.liquidado_em > c.saldo_inicial_em
      WHERE c.ativa AND (${empresa ?? null}::text IS NULL OR c.company_id = ${empresa ?? null}::text)
      GROUP BY c.id, c.saldo_inicial`;
  }

  /** `papel`: o saldo calculado da conta só para quem alcança os dois tipos (senão, pelo RLS, ele seria parcial). */
  async opcoes(papel: PapelNoFinanceiro): Promise<OpcoesDoFinanceiro> {
    const veSaldo = papel.saidas && papel.entradas;
    const [categorias, contas, fornecedores, saldos] = await this.prisma.comContexto((tx) => Promise.all([
      tx.categoriaFinanceira.findMany({ orderBy: [{ companyId: "asc" }, { codigo: "asc" }] }),
      tx.contaCorrente.findMany({ orderBy: [{ companyId: "asc" }, { nome: "asc" }] }),
      tx.fornecedor.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
      veSaldo ? this.saldosDasContas(tx) : Promise.resolve([]),
    ]));
    const saldoDa = new Map(saldos.map((c) => [c.id, c]));
    return {
      categorias: categorias.map(paraCategoria),
      contasCorrentes: contas.map((c) => ({
        ...paraConta(c),
        saldoCalculado: veSaldo ? (saldoDa.get(c.id)?.saldo?.toFixed(2) ?? null) : null,
        saldoConciliado: veSaldo ? (saldoDa.get(c.id)?.saldoConciliado?.toFixed(2) ?? null) : null,
      })),
      fornecedores,
      formasDePagamento: [...formasDoLancamento],
    };
  }

  // ------------------------------------------------------------ escrita

  async criarContaAPagar(input: CriarContaAPagar, principal: AuthPrincipal): Promise<string> {
    return this.prisma.comContexto(async (tx) => {
      await this.garantirFornecedor(tx, input.fornecedorId);
      // Sem categoria (CC14), a conta nasce para ser classificada depois.
      if (input.categoriaId) await this.garantirCategoria(tx, input.categoriaId, input.empresa, "saida");
      await this.garantirConta(tx, input.contaCorrenteId, input.empresa);
      const criado = await tx.lancamento.create({
        data: {
          tipo: "saida",
          companyId: input.empresa,
          fornecedorId: input.fornecedorId,
          categoriaId: input.categoriaId ?? null,
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
      await this.reflexos.aoMudar(tx, { lancamentoId: criado.id, empresa: criado.companyId, tipo: "saida", etapaAntes: "aberta", mudanca: "criado", porId: principal.id });
      return criado.id;
    });
  }

  async editar(id: string, input: EditarLancamento, principal: AuthPrincipal, papel: PapelNoFinanceiro): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id, papel);
      // Só conta o que muda de valor: a ficha pode reenviar o formulário inteiro.
      const valorAtual: Record<keyof EditarLancamento, unknown> = {
        fornecedorId: atual.fornecedorId,
        categoriaId: atual.categoriaId,
        contaCorrenteId: atual.contaCorrenteId,
        descricao: atual.descricao,
        vencimento: dia(atual.vencimento),
        forma: atual.forma,
        observacao: atual.observacao,
      };
      const campos = (Object.keys(input) as (keyof EditarLancamento)[])
        .filter((campo) => input[campo] !== undefined && input[campo] !== valorAtual[campo])
        .sort();
      const problema = problemaDaEdicao(atual, campos, papel);
      if (problema?.codigo === "CONFLITO_ESTADO") throw new EstadoInvalido(problema.mensagem);
      if (problema?.codigo === "ACESSO_NEGADO") throw new AcessoNegado(problema.mensagem);
      if (problema) throw new RequisicaoInvalida(problema.mensagem, problema.campo ? [{ campo: problema.campo, problema: problema.mensagem }] : undefined);
      // Edição sem campo nenhum não grava nem gera evento.
      if (campos.length === 0) return;
      if (input.fornecedorId && campos.includes("fornecedorId")) await this.garantirFornecedor(tx, input.fornecedorId);
      if (input.categoriaId && campos.includes("categoriaId")) await this.garantirCategoria(tx, input.categoriaId, atual.companyId, atual.tipo);
      if (input.contaCorrenteId && campos.includes("contaCorrenteId")) await this.garantirConta(tx, input.contaCorrenteId, atual.companyId);
      await tx.lancamento.update({
        where: { id },
        data: {
          ...(campos.includes("fornecedorId") ? { fornecedorId: input.fornecedorId } : {}),
          ...(campos.includes("categoriaId") ? { categoriaId: input.categoriaId } : {}),
          ...(campos.includes("contaCorrenteId") ? { contaCorrenteId: input.contaCorrenteId } : {}),
          ...(campos.includes("descricao") ? { descricao: input.descricao } : {}),
          ...(campos.includes("vencimento") && input.vencimento ? { vencimento: inicioDoDiaEmManaus(input.vencimento) } : {}),
          ...(campos.includes("forma") ? { forma: input.forma } : {}),
          ...(campos.includes("observacao") ? { observacao: input.observacao } : {}),
        },
      });
      await tx.historicoDeLancamento.create({ data: { lancamentoId: id, tipo: "editado", porId: principal.id, dados: { campos } } });
      await this.registrar(tx, "financeiro.lancamento.updated", id, atual.companyId, principal, { campos });
      await this.reflexos.aoMudar(tx, { lancamentoId: id, empresa: atual.companyId, tipo: atual.tipo, etapaAntes: atual.etapa, mudanca: "editado", porId: principal.id });
    });
  }

  /** Uma transação, com o lançamento travado: estado, acesso, gravação, histórico e evento. */
  async executarAcao(id: string, acao: AcaoDoLancamento, principal: AuthPrincipal, papel: PapelNoFinanceiro, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id, papel);
      if (ehTransferencia(atual)) throw new EstadoInvalido("A perna de uma transferência entre contas não muda: conta, valor e dia são os da transferência.");
      // A conta de um pedido de compra se cancela pelo pedido, em Compras, para os dois não divergirem (W3c).
      if (acao.acao === "cancelar" && atual.origem === "pedido_de_compra" && atual.pedidoDeCompraId) {
        const pedido = (await this.pedidosDasContas([atual])).get(atual.pedidoDeCompraId);
        const qual = pedido ? `do pedido PC-${String(pedido.numero).padStart(4, "0")}` : "de um pedido de compra";
        throw new EstadoInvalido(`Esta conta é ${qual}: cancele o pedido em Compras, e a conta é cancelada junto.`);
      }
      const plano = planejarAcao(atual, acao, await anexosAtuais(tx, id), agora);
      if ("codigo" in plano) {
        const detalhes = plano.campo ? [{ campo: plano.campo, problema: plano.mensagem }] : undefined;
        if (plano.codigo === "REQUISICAO_INVALIDA") throw new RequisicaoInvalida(plano.mensagem, detalhes);
        throw new EstadoInvalido(plano.mensagem, detalhes);
      }
      if (!podeExecutar(papel, atual, acao.acao)) {
        throw new AcessoNegado(acao.acao === "aprovar" || atual.etapa !== "aberta"
          ? "Só a Gerente do Financeiro aprova a conta, ou cancela e corrige o valor de uma conta aprovada."
          : "Esta ação não está entre as suas.");
      }
      const historico = (tipo: string, dados: Record<string, unknown>, texto: string | null = null) =>
        tx.historicoDeLancamento.create({ data: { lancamentoId: id, tipo, porId: principal.id, dados: dados as Prisma.InputJsonValue, texto, em: agora } });
      const evento = (nome: NomeDeEventoDoCatalogo, payload: Record<string, unknown> = {}) => this.registrar(tx, nome, id, atual.companyId, principal, payload);
      const aplicar = async (): Promise<unknown> => {
        switch (plano.tipo) {
          case "aprovar":
            await tx.lancamento.update({ where: { id }, data: { etapa: plano.etapa, aprovadoEm: agora, aprovadoPorId: principal.id } });
            return evento("financeiro.lancamento.aprovado");
          case "cancelar":
            await tx.lancamento.update({ where: { id }, data: { canceladoEm: agora, canceladoPorId: principal.id, cancelamentoMotivo: plano.motivo } });
            // O motivo fica no lançamento: texto livre não entra no evento.
            return evento("financeiro.lancamento.cancelado", { etapa: atual.etapa, comMotivo: true });
          case "corrigir_valor": {
            // Na entrada recebida, corrige-se o que entrou (o valor recebido); o valor cobrado fica.
            // O valor anterior fica na linha do tempo; o pedido de compra da conta não muda (CC17).
            const doRecebido = atual.tipo === "entrada" && atual.etapa === "recebida";
            const linha = await tx.lancamento.findUniqueOrThrow({ where: { id }, select: { valor: true, valorRecebido: true } });
            const de = (doRecebido ? (linha.valorRecebido ?? linha.valor) : linha.valor).toFixed(2);
            const para = new Prisma.Decimal(plano.valor);
            if (de === para.toFixed(2)) throw new RequisicaoInvalida("O valor novo é igual ao atual.", [{ campo: "valor", problema: "O valor novo é igual ao atual." }]);
            await tx.lancamento.update({ where: { id }, data: doRecebido ? { valorRecebido: para } : { valor: para } });
            await historico("valor_corrigido", { de, para: para.toFixed(2), ...(doRecebido ? { campo: "valorRecebido" } : {}) }, plano.motivo);
            return evento("financeiro.lancamento.valor_corrigido", { comMotivo: true, ...(doRecebido ? { campo: "valorRecebido" } : {}) });
          }
          case "registrar_nf":
            await tx.lancamento.update({ where: { id }, data: { etapa: plano.etapa, nfNumero: plano.numero, nfRegistradaEm: agora, nfRegistradaPorId: principal.id } });
            return evento("financeiro.lancamento.nf_registrada");
          case "registrar_boleto":
            await tx.lancamento.update({ where: { id }, data: { etapa: plano.etapa, boletoRegistradoEm: agora, boletoRegistradoPorId: principal.id } });
            return evento("financeiro.lancamento.boleto_registrado");
          case "registrar_envio":
            await tx.lancamento.update({ where: { id }, data: { etapa: plano.etapa, enviadoEm: agora, envioCanal: plano.canal, enviadoPorId: principal.id } });
            // O canal é texto livre (pode ter telefone ou e-mail): fica no lançamento, não no evento.
            return evento("financeiro.lancamento.enviado");
          case "registrar_cobranca":
            // Não muda a etapa: o contato vai à linha do tempo, com a nota.
            await historico("cobranca_registrada", { canal: plano.canal }, plano.nota);
            return evento("financeiro.lancamento.cobranca_registrada");
          case "registrar_pagamento":
            await this.garantirConta(tx, plano.contaCorrenteId, atual.companyId);
            await tx.lancamento.update({
              where: { id },
              data: { etapa: plano.etapa, forma: plano.forma, contaCorrenteId: plano.contaCorrenteId, pagoEm: inicioDoDiaEmManaus(plano.pagoEm), pagamentoRegistradoEm: agora, pagamentoRegistradoPorId: principal.id },
            });
            return evento("financeiro.lancamento.pago", { forma: plano.forma });
          case "registrar_recebimento":
            await this.garantirConta(tx, plano.contaCorrenteId, atual.companyId);
            await tx.lancamento.update({
              where: { id },
              data: { etapa: plano.etapa, contaCorrenteId: plano.contaCorrenteId, recebidoEm: inicioDoDiaEmManaus(plano.recebidoEm), valorRecebido: new Prisma.Decimal(plano.valor), recebimentoRegistradoEm: agora, recebimentoRegistradoPorId: principal.id },
            });
            return evento("financeiro.lancamento.recebido");
        }
      };
      await aplicar();
      // Quem estiver inscrito nos reflexos ouve o fato na mesma transação.
      await this.reflexos.aoMudar(tx, { lancamentoId: id, empresa: atual.companyId, tipo: atual.tipo, etapaAntes: atual.etapa, mudanca: MUDANCA_DO_PLANO[plano.tipo], porId: principal.id });
    });
  }

  /**
   * Um anexo novo. Um `comprovante`, `nf` ou `boleto` marca o atual do mesmo tipo
   * como substituído (o gatilho do banco só deixa isso); nada se apaga.
   */
  async registrarAnexo(id: string, tipo: TipoDeAnexo, arquivo: ArquivoDoLancamento, principal: AuthPrincipal, papel: PapelNoFinanceiro, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id, papel);
      if (atual.canceladoEm) throw new EstadoInvalido("O lançamento está cancelado.");
      const anterior = tipo === "documento" ? null : await tx.anexoDeLancamento.findFirst({ where: { lancamentoId: id, tipo, substituidoEm: null }, select: { id: true } });
      if (anterior) await tx.anexoDeLancamento.update({ where: { id: anterior.id }, data: { substituidoEm: agora, substituidoPorId: principal.id } });
      await tx.anexoDeLancamento.create({
        data: { lancamentoId: id, tipo, arquivoChave: arquivo.chave, arquivoNome: arquivo.nome, arquivoTamanho: arquivo.tamanho, arquivoTipo: arquivo.tipo, enviadoPorId: principal.id, enviadoEm: agora },
      });
      await tx.historicoDeLancamento.create({ data: { lancamentoId: id, tipo: anterior ? "anexo_substituido" : "anexo_enviado", porId: principal.id, dados: { anexo: tipo }, em: agora } });
      await this.registrar(tx, anterior ? "financeiro.anexo.substituido" : "financeiro.anexo.enviado", id, atual.companyId, principal, { tipo });
    });
  }

  /**
   * O arquivo de um anexo, se o lançamento for visível para a pessoa. O comprovante
   * de um lançamento liquidado sai com o nome padronizado, como no .zip.
   */
  async arquivoDoAnexo(id: string, anexoId: string, papel: PapelNoFinanceiro): Promise<ArquivoDoLancamento> {
    const anexo = await this.prisma.comContexto((tx) => tx.anexoDeLancamento.findFirst({
      where: { id: anexoId, lancamentoId: id },
      select: {
        tipo: true, arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true,
        lancamento: { select: { tipo: true, numero: true, origem: true, valor: true, valorRecebido: true, liquidadoEm: true, clientId: true, fornecedor: { select: { nome: true } } } },
      },
    }));
    if (!anexo || !tiposVisiveis(papel, "todos").includes(anexo.lancamento.tipo)) throw new NaoEncontrado("Anexo não encontrado.");
    const l = anexo.lancamento;
    let nome = anexo.arquivoNome;
    if (anexo.tipo === "comprovante" && l.liquidadoEm) {
      const favorecido = l.tipo === "saida" ? l.fornecedor?.nome ?? "Fornecedor" : (l.clientId && (await this.nomesDeClientes([l.clientId])).get(l.clientId)) || "Cliente";
      nome = nomePadronizadoDoComprovante({ dia: l.liquidadoEm, codigo: codigoDoLancamento(l.tipo, l.numero, l.origem), favorecido, valor: (l.valorRecebido ?? l.valor).toFixed(2), mime: anexo.arquivoTipo });
    }
    return { chave: anexo.arquivoChave, nome, tamanho: anexo.arquivoTamanho, tipo: anexo.arquivoTipo };
  }

  /**
   * Cobrança manual (A7): entrada `gerada`, origem `cobranca_manual`, uma por cliente,
   * empresa e competência (o índice parcial do banco garante; a repetida é 409 com a
   * existente). O cliente tem de estar ativo, a categoria ser de receita da empresa e
   * as UCs serem do cliente.
   */
  async criarCobranca(input: CriarCobranca, principal: AuthPrincipal): Promise<string> {
    try {
      return await this.prisma.comContexto(async (tx) => {
        // As checagens do cliente e das UCs ficam na mesma transação da criação.
        const [cliente] = await tx.$queryRaw<{ ativo: boolean }[]>`SELECT plugga_security.cliente_ativo_para_financeiro(${input.clientId}::uuid) AS ativo`;
        if (!cliente?.ativo) throw new RequisicaoInvalida("Cliente não encontrado ou inativo.", [{ campo: "clientId", problema: "Escolha um cliente ativo do cadastro." }]);
        if (input.ucIds.length > 0) {
          const doCliente = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.ucs_para_financeiro(${[input.clientId]}::uuid[])`;
          if (input.ucIds.some((id) => !doCliente.some((u) => u.id === id))) {
            throw new RequisicaoInvalida("Há UC que não é do cliente.", [{ campo: "ucIds", problema: "Escolha só UCs deste cliente." }]);
          }
        }
        await this.garantirCategoria(tx, input.categoriaId, input.empresa, "entrada");
        if (input.contaCorrenteId) await this.garantirConta(tx, input.contaCorrenteId, input.empresa);
        const criado = await tx.lancamento.create({
          data: {
            tipo: "entrada",
            companyId: input.empresa,
            clientId: input.clientId,
            categoriaId: input.categoriaId,
            contaCorrenteId: input.contaCorrenteId ?? null,
            descricao: input.descricao,
            valor: new Prisma.Decimal(input.valor),
            vencimento: inicioDoDiaEmManaus(input.vencimento),
            competencia: input.competencia,
            observacao: input.observacao ?? null,
            etapa: "gerada",
            origem: "cobranca_manual",
            criadoPorId: principal.id,
          },
          select: { id: true, companyId: true },
        });
        if (input.ucIds.length > 0) await tx.ucDeLancamento.createMany({ data: input.ucIds.map((consumerUnitId) => ({ lancamentoId: criado.id, consumerUnitId })) });
        await this.registrar(tx, "financeiro.lancamento.created", criado.id, criado.companyId, principal, { tipo: "entrada", origem: "cobranca_manual", ucs: input.ucIds.length });
        await this.reflexos.aoMudar(tx, { lancamentoId: criado.id, empresa: criado.companyId, tipo: "entrada", etapaAntes: "gerada", mudanca: "criado", porId: principal.id });
        return criado.id;
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        const existente = await this.prisma.comContexto((tx) => tx.lancamento.findFirst({
          where: { tipo: "entrada", companyId: input.empresa, clientId: input.clientId, competencia: input.competencia, canceladoEm: null },
          select: { id: true, numero: true },
        }));
        const codigo = existente ? codigoDoLancamento("entrada", existente.numero) : null;
        throw new Conflito(
          codigo ? `Já existe a ${codigo} deste cliente nesta competência.` : "Já existe a cobrança deste cliente nesta competência.",
          [{ campo: "competencia", problema: "Uma cobrança por cliente e competência." }],
          // `codigo` já é a chave do envelope de erro: a existente vai dentro de `existente`.
          existente ? { existente: { codigo, id: existente.id } } : undefined,
        );
      }
      throw erro;
    }
  }

  /** Busca de clientes para a cobrança: só id, nome e as UCs. */
  async buscarClientesComUcs(busca: string): Promise<{ id: string; nome: string; ucs: { id: string; codigo: string }[] }[]> {
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_financeiro(${busca}, NULL::uuid[])`);
    const ucs = await this.ucsDosClientes(linhas.map((l) => l.id));
    return linhas.map((l) => ({ id: l.id, nome: l.name, ucs: ucs.get(l.id) ?? [] }));
  }

  /** F4: o valor da cobrança do mesmo cliente e empresa na competência anterior mais recente. */
  async sugestaoDeCobranca(empresa: CompanyKey, clientId: string, competencia: string): Promise<{ valor: string | null; competencia: string | null; codigo: string | null }> {
    const anterior = await this.prisma.comContexto((tx) => tx.lancamento.findFirst({
      where: { tipo: "entrada", companyId: empresa, clientId, canceladoEm: null, competencia: { lt: competencia } },
      orderBy: [{ competencia: "desc" }, { createdAt: "desc" }],
      select: { valor: true, competencia: true, numero: true },
    }));
    return anterior
      ? { valor: anterior.valor.toFixed(2), competencia: anterior.competencia, codigo: codigoDoLancamento("entrada", anterior.numero) }
      : { valor: null, competencia: null, codigo: null };
  }

  /**
   * Os comprovantes ATUAIS dos lançamentos pagos ou recebidos no período (pelo dia do
   * pagamento ou do recebimento), dos tipos que a pessoa alcança, com o nome padronizado.
   */
  async comprovantesDoPeriodo(
    filtro: { empresa?: CompanyKey; de: string; ate: string; tipos: TipoDeLancamento[] },
    limite: number,
  ): Promise<{ total: number; itens: (ArquivoDoLancamento & { nomePadronizado: string; data: Date })[] }> {
    const where: Prisma.AnexoDeLancamentoWhereInput = {
      tipo: "comprovante",
      substituidoEm: null,
      lancamento: {
        tipo: { in: filtro.tipos },
        canceladoEm: null,
        ...(filtro.empresa ? { companyId: filtro.empresa } : {}),
        liquidadoEm: { gte: inicioDoDiaEmManaus(filtro.de), lte: inicioDoDiaEmManaus(filtro.ate) },
      },
    };
    const [total, anexos] = await this.prisma.comContexto((tx) => Promise.all([
      tx.anexoDeLancamento.count({ where }),
      tx.anexoDeLancamento.findMany({
        where,
        take: limite + 1,
        orderBy: [{ lancamento: { liquidadoEm: "asc" } }, { enviadoEm: "asc" }],
        select: {
          arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true, enviadoEm: true,
          lancamento: { select: { tipo: true, numero: true, origem: true, valor: true, valorRecebido: true, liquidadoEm: true, clientId: true, fornecedor: { select: { nome: true } } } },
        },
      }),
    ]));
    const clientes = await this.nomesDeClientes(anexos.map((a) => a.lancamento.clientId));
    return {
      total,
      itens: anexos.slice(0, limite).map((a) => {
        const l = a.lancamento;
        const favorecido = l.tipo === "saida" ? l.fornecedor?.nome ?? "Fornecedor" : (l.clientId && clientes.get(l.clientId)) || "Cliente";
        return {
          chave: a.arquivoChave, nome: a.arquivoNome, tamanho: a.arquivoTamanho, tipo: a.arquivoTipo, data: a.enviadoEm,
          nomePadronizado: nomePadronizadoDoComprovante({ dia: l.liquidadoEm ?? a.enviadoEm, codigo: codigoDoLancamento(l.tipo, l.numero, l.origem), favorecido, valor: (l.valorRecebido ?? l.valor).toFixed(2), mime: a.arquivoTipo }),
        };
      }),
    };
  }

  /** As UCs dos clientes, pela função (o Financeiro não lê o CRM). */
  private async ucsDosClientes(clientes: string[]): Promise<Map<string, { id: string; codigo: string }[]>> {
    if (clientes.length === 0) return new Map();
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; client_id: string; code: string }[]>`
      SELECT id, client_id, code FROM plugga_security.ucs_para_financeiro(${clientes}::uuid[])`);
    const porCliente = new Map<string, { id: string; codigo: string }[]>();
    for (const l of linhas) porCliente.set(l.client_id, [...(porCliente.get(l.client_id) ?? []), { id: l.id, codigo: l.code }]);
    return porCliente;
  }

  // ------------------------------------------------------------ apoio

  /** SELECT … FOR UPDATE: duas requisições ao mesmo lançamento passam uma de cada vez. */
  private async travar(tx: Prisma.TransactionClient, id: string, papel: PapelNoFinanceiro) {
    const linhas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.lancamentos WHERE id = ${id}::uuid FOR UPDATE`;
    const linha = linhas.length === 0 ? null : await tx.lancamento.findUnique({
      where: { id },
      select: {
        tipo: true, etapa: true, canceladoEm: true, vencimento: true, companyId: true, origem: true, pedidoDeCompraId: true,
        fornecedorId: true, categoriaId: true, contaCorrenteId: true, descricao: true, forma: true, observacao: true,
      },
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
    const problema = !c ? "Escolha uma categoria da empresa."
      : c.companyId !== empresa ? "A categoria é de outra empresa."
      : c.tipo !== (tipo === "saida" ? "despesa" : "receita") ? (tipo === "saida" ? "Conta a pagar usa categoria de despesa." : "Cobrança usa categoria de receita.")
      : !c.ativa ? "A categoria está inativa." : null;
    if (problema) throw new RequisicaoInvalida(problema, [{ campo: "categoriaId", problema }]);
  }

  private async garantirConta(tx: Prisma.TransactionClient, id: string, empresa: string): Promise<void> {
    const c = await tx.contaCorrente.findUnique({ where: { id }, select: { companyId: true, ativa: true } });
    const problema = !c ? "Escolha uma conta corrente da empresa."
      : c.companyId !== empresa ? "A conta corrente é de outra empresa."
      : !c.ativa ? "A conta corrente está inativa." : null;
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
    if (situacao.transferencias) condicoes.push({ origem: "transferencia" });
    if (query.pagoSemAprovacao !== undefined) {
      const semAprovacao: Prisma.LancamentoWhereInput = { tipo: "saida", origem: { in: [...origensPagasSemAprovacao] } };
      condicoes.push(query.pagoSemAprovacao ? semAprovacao : { NOT: semAprovacao });
    }

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
      if (numero) {
        ou.push({
          numero: numero.numero,
          ...(numero.tipo ? { tipo: numero.tipo } : {}),
          ...(numero.transferencia === true ? { origem: "transferencia" } : numero.transferencia === false ? { origem: { not: "transferencia" } } : {}),
        });
      }
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
  async resumo(papel: PapelNoFinanceiro, empresa: CompanyKey | undefined, agora: Date): Promise<ResumoDosLancamentos> {
    const ateDia = fimDoMesEmManaus(agora);
    const ate = inicioDoDiaEmManaus(ateDia);
    const hoje = inicioDoDiaEmManaus(dia(agora));
    // A transferência entre contas não é receita nem despesa: fora dos cards (as pernas já nascem liquidadas).
    const base: Prisma.LancamentoWhereInput = { canceladoEm: null, etapa: { in: etapasEmAberto }, origem: { not: "transferencia" }, ...(empresa ? { companyId: empresa } : {}) };
    const tipos = tiposVisiveis(papel, "todos");
    const [ateOFim, vencidos, paraAprovar, saldos] = await this.prisma.comContexto((tx) => Promise.all([
      tx.lancamento.groupBy({ by: ["tipo"], where: { ...base, tipo: { in: tipos }, vencimento: { lte: ate } }, _sum: { valor: true }, _count: { _all: true } }),
      tx.lancamento.groupBy({ by: ["tipo"], where: { ...base, tipo: { in: tipos }, vencimento: { lt: hoje } }, _sum: { valor: true } }),
      papel.saidas ? tx.lancamento.count({ where: { ...base, tipo: "saida", etapa: "aberta", vencimento: { lte: ate } } }) : Promise.resolve(0),
      this.saldosDasContas(tx, empresa),
    ]));
    const soma = (grupos: { tipo: TipoDeLancamento; _sum: { valor: Prisma.Decimal | null } }[], tipo: TipoDeLancamento) =>
      grupos.find((g) => g.tipo === tipo)?._sum.valor ?? ZERO;
    const quantidade = (tipo: TipoDeLancamento) => ateOFim.find((g) => g.tipo === tipo)?._count._all ?? 0;
    const aReceber = soma(ateOFim, "entrada");
    const aPagar = soma(ateOFim, "saida");
    // O saldo é do Plugga OS (PLU-339, C4): o saldo inicial de cada conta mais o conciliado depois.
    const comSaldo = saldos.filter((c) => c.saldo !== null);
    const saldoNasContas = comSaldo.length > 0 ? comSaldo.reduce((t, c) => t.add(c.saldo!), ZERO) : null;
    const contasSemSaldoInicial = saldos.length - comSaldo.length;
    const vencidoReceber = papel.entradas ? soma(vencidos, "entrada") : null;
    const vencidoPagar = papel.saidas ? soma(vencidos, "saida") : null;
    return {
      ate: ateDia,
      aReceber: papel.entradas ? { valor: aReceber.toFixed(2), quantidade: quantidade("entrada") } : null,
      aPagar: papel.saidas ? { valor: aPagar.toFixed(2), quantidade: quantidade("saida"), paraAprovar } : null,
      saldoProjetado: papel.saidas && papel.entradas
        ? { valor: (saldoNasContas ?? ZERO).add(aReceber).sub(aPagar).toFixed(2), saldoNasContas: saldoNasContas?.toFixed(2) ?? null, contasSemSaldoInicial }
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

  /**
   * O pedido de compra de cada conta (W3): número e valor original. Quem só tem o
   * Financeiro não lê Compras, então vem pela função, como o nome dos clientes.
   */
  private async pedidosDasContas(linhas: readonly { pedidoDeCompraId: string | null }[]): Promise<PedidosDasContas> {
    const ids = [...new Set(linhas.map((l) => l.pedidoDeCompraId).filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Map();
    const encontrados = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; numero: number; valor: Prisma.Decimal }[]>`
      SELECT id, numero, valor FROM plugga_security.pedidos_das_contas(${ids}::uuid[])`);
    return new Map(encontrados.map((p) => [p.id, { id: p.id, numero: p.numero, valor: p.valor.toFixed(2) }]));
  }

  private paraResumo(l: LinhaDoLancamento, clientes: NomesDeClientes, agora: Date, pedidos: PedidosDasContas = new Map()): LancamentoResumo {
    const t = l.transferencia;
    // Na perna da transferência, o favorecido é a outra conta.
    const outraConta = t ? (l.tipo === "saida" ? t.contaDestino : t.contaOrigem) : null;
    const favorecido = outraConta
      ? { tipo: "conta" as const, id: outraConta.id, nome: outraConta.nome }
      : l.tipo === "saida"
        ? { tipo: "fornecedor" as const, id: l.fornecedor?.id ?? l.fornecedorId ?? "", nome: l.fornecedor?.nome ?? "Fornecedor" }
        : { tipo: "cliente" as const, id: l.clientId ?? "", nome: (l.clientId && clientes.get(l.clientId)) || "Cliente" };
    return {
      id: l.id,
      tipo: l.tipo,
      codigo: codigoDoLancamento(l.tipo, l.numero, l.origem),
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
      quantidadeDeUcs: l._count.ucs,
      liquidadoEm: l.liquidadoEm ? dia(l.liquidadoEm) : null,
      anexos: l._count.anexos,
      origem: { tipo: l.origem, pedidoDeCompra: (l.pedidoDeCompraId && pedidos.get(l.pedidoDeCompraId)) || l.pedidoDeCompra },
      pagoSemAprovacao: pagoSemAprovacao(l),
      ...(t ? { transferencia: { id: t.id, codigo: codigoDaTransferencia(t.numero), sentido: l.tipo } } : {}),
      createdAt: l.createdAt.toISOString(),
    };
  }

  private paraDetalhe(
    l: LinhaDoDetalhe,
    clientes: NomesDeClientes,
    ucsDoCliente: Map<string, { id: string; codigo: string }[]>,
    papel: PapelNoFinanceiro,
    agora: Date,
    pedidos: PedidosDasContas = new Map(),
  ): Lancamento {
    const registro = (por: { id: string; name: string } | null, em: Date | null) => (em ? { por: pessoa(por), em: em.toISOString() } : null);
    const resumo = this.paraResumo(l, clientes, agora, pedidos);
    const anexos: AnexosAtuais = {
      comprovante: l.anexos.some((a) => a.tipo === "comprovante" && !a.substituidoEm),
      boleto: l.anexos.some((a) => a.tipo === "boleto" && !a.substituidoEm),
    };
    const diaDoComprovante = l.pagoEm ?? l.recebidoEm;
    const arquivos = l.anexos.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      nome: a.arquivoNome,
      nomePadronizado: a.tipo === "comprovante" && diaDoComprovante
        ? nomePadronizadoDoComprovante({ dia: diaDoComprovante, codigo: resumo.codigo, favorecido: resumo.favorecido.nome, valor: (l.valorRecebido ?? l.valor).toFixed(2), mime: a.arquivoTipo })
        : null,
      tamanhoBytes: a.arquivoTamanho,
      mime: a.arquivoTipo,
      url: `/financeiro/lancamentos/${l.id}/anexos/${a.id}`,
      enviado: { por: pessoa(a.enviadoPor), em: a.enviadoEm.toISOString() },
      substituido: a.substituidoEm ? { por: pessoa(a.substituidoPor), em: a.substituidoEm.toISOString() } : null,
    }));
    const doCliente = l.clientId ? ucsDoCliente.get(l.clientId) ?? [] : [];
    const listadas = new Set(l.ucs.map((u) => u.consumerUnitId));
    return {
      ...resumo,
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
      // A perna da transferência não muda (o par não diverge): sem ações nem edição.
      acoesPermitidas: ehTransferencia(l) ? [] : acoesPermitidas(l, papel, anexos, agora),
      podeEditar: !ehTransferencia(l) && podeEditar(l, papel),
      updatedAt: l.updatedAt.toISOString(),
      arquivos,
      comprovanteAtual: arquivos.find((a) => a.tipo === "comprovante" && !a.substituido) ?? null,
      linhaDoTempo: linhaDoTempo(l, l.historico.map((h) => ({ tipo: h.tipo, em: h.em, por: h.por, dados: h.dados, texto: h.texto }))),
      nf: l.nfNumero && l.nfRegistradaEm ? { numero: l.nfNumero, registrada: { por: pessoa(l.nfRegistradaPor), em: l.nfRegistradaEm.toISOString() } } : null,
      envio: l.enviadoEm && l.envioCanal ? { por: pessoa(l.enviadoPor), em: l.enviadoEm.toISOString(), canal: l.envioCanal } : null,
      cobrancas: l.historico.filter((h) => h.tipo === "cobranca_registrada").map((h) => ({
        por: pessoa(h.por), em: h.em.toISOString(), canal: String((h.dados as { canal?: string }).canal ?? ""), nota: h.texto,
      })),
      ucs: doCliente.filter((u) => listadas.has(u.id)),
      pendencias: l.canceladoEm || ehTransferencia(l) ? [] : pendenciasDoLancamento(l, anexos),
      // No detalhe, a transferência completa (as duas contas e a outra perna) no lugar da do resumo.
      transferencia: l.transferencia ? this.transferenciaDoDetalhe(l) : undefined,
    };
  }

  private transferenciaDoDetalhe(l: LinhaDoDetalhe): NonNullable<Lancamento["transferencia"]> {
    const t = l.transferencia!;
    return {
      id: t.id, codigo: codigoDaTransferencia(t.numero), sentido: l.tipo, contaOrigem: t.contaOrigem, contaDestino: t.contaDestino,
      outraPerna: outraPernaDaTransferencia(l, t.numero, t.pernas),
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

