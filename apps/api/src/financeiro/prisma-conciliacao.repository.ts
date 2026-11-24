import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CompanyKey,
  CriarLancamentoDoExtrato,
  CriarTarifa,
  EscopoDaConciliacao,
  ExtratoImportado,
  LancamentoNaConciliacao,
  LancamentoCriadoNaConciliacao,
  ListarMovimentosDoExtratoQuery,
  MovimentoDoExtrato,
  MovimentosDoExtratoResposta,
  NomeDeEventoDoCatalogo,
  PainelDaConciliacao,
  SugestaoDaTarifa,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, ErroDeDominio, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { montarPainel, pareceTarifa, problemaDaLinhaParaCriar, problemaDoPar, JANELA_DA_SUGESTAO_DIAS, type LancamentoParaConciliar, type MovimentoParaConciliar } from "./conciliacao.rules";
import { conteudoDoMovimento, type ExtratoLido, type MovimentoLido } from "./extrato-ofx";
import { codigoDoLancamento } from "./financeiro.rules";
import { ReflexosDoLancamento } from "./reflexo-do-lancamento";

const DIA_MS = 86_400_000;
const SELECAO_DO_LANCAMENTO = {
  id: true, tipo: true, numero: true, companyId: true, contaCorrenteId: true, etapa: true, canceladoEm: true, liquidadoEm: true,
  valor: true, valorRecebido: true, descricao: true, clientId: true, conciliacaoMarcada: true,
  fornecedor: { select: { nome: true } },
} satisfies Prisma.LancamentoSelect;
type LinhaDoLancamento = Prisma.LancamentoGetPayload<{ select: typeof SELECAO_DO_LANCAMENTO }>;
type LinhaDoMovimento = Prisma.MovimentoDoExtratoGetPayload<object>;

const paraMovimento = (m: LinhaDoMovimento): MovimentoDoExtrato => ({
  id: m.id, contaCorrenteId: m.contaCorrenteId, dia: diaEmManaus(m.dia), valor: m.valor.toFixed(2), descricao: m.descricao,
  estado: m.estado as MovimentoDoExtrato["estado"],
  pareceTarifa: pareceTarifa({ valor: m.valor.toFixed(2), tipoNoBanco: m.tipoNoBanco, descricao: m.descricao }),
});
const paraRegraDoMovimento = (m: LinhaDoMovimento): MovimentoParaConciliar => ({
  id: m.id, contaCorrenteId: m.contaCorrenteId, dia: diaEmManaus(m.dia), valor: m.valor.toFixed(2), estado: m.estado as MovimentoParaConciliar["estado"], lancamentoId: m.lancamentoId,
});
const valorLiquidado = (l: LinhaDoLancamento) => (l.tipo === "entrada" ? (l.valorRecebido ?? l.valor) : l.valor).toFixed(2);
const paraRegraDoLancamento = (l: LinhaDoLancamento): LancamentoParaConciliar => ({
  id: l.id, tipo: l.tipo, contaCorrenteId: l.contaCorrenteId, etapa: l.etapa, cancelado: l.canceladoEm !== null,
  liquidadoEm: l.liquidadoEm ? diaEmManaus(l.liquidadoEm) : null, valorLiquidado: valorLiquidado(l), marcado: l.conciliacaoMarcada,
});

export type ContaDoExtrato = { id: string; companyId: CompanyKey; nome: string; numero: string | null };
export type ArquivoDoExtrato = { chave: string; nome: string; tamanho: number; sha256: string; origem: "ofx" | "csv" };

type LinhaDoExtrato = Prisma.ExtratoBancarioGetPayload<object>;
const paraExtrato = (e: LinhaDoExtrato, repetidos: number): ExtratoImportado => ({
  id: e.id,
  contaCorrenteId: e.contaCorrenteId,
  origem: e.origem as ExtratoImportado["origem"],
  arquivoNome: e.arquivoNome,
  periodo: { de: diaEmManaus(e.periodoDe), ate: diaEmManaus(e.periodoAte) },
  saldoInformado: e.saldoInformado && e.saldoInformadoEm ? { valor: e.saldoInformado.toFixed(2), em: diaEmManaus(e.saldoInformadoEm) } : null,
  movimentos: e.movimentos,
  novos: e.novos,
  repetidos,
  importadoEm: e.importadoEm.toISOString(),
});

/**
 * A conciliação (PLU-339): o extrato bancário importado e os movimentos dele. Quem tem a
 * tela Conciliação lê e importa (RLS); nada se apaga. A descrição dos movimentos é dado
 * bancário: não vai a evento nem a log.
 */
@Injectable()
export class PrismaConciliacaoRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
    @Optional() @Inject(ReflexosDoLancamento) private readonly reflexos: ReflexosDoLancamento = new ReflexosDoLancamento(),
  ) {}

  async conta(id: string): Promise<ContaDoExtrato> {
    const conta = await this.prisma.comContexto((tx) => tx.contaCorrente.findUnique({ where: { id }, select: { id: true, companyId: true, nome: true, numero: true } }));
    if (!conta) throw new NaoEncontrado("Conta corrente não encontrada.");
    return { ...conta, companyId: conta.companyId as CompanyKey };
  }

  /**
   * O extrato e os movimentos novos, numa transação, com a conta travada (duas importações
   * ao mesmo tempo não duplicam nada). O mesmo arquivo na mesma conta é recusado; o
   * movimento que já entrou por outro arquivo conta como repetido.
   */
  async importar(conta: ContaDoExtrato, arquivo: ArquivoDoExtrato, lido: ExtratoLido, principal: AuthPrincipal, agora: Date): Promise<ExtratoImportado> {
    return this.prisma.comContexto(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`extrato.${conta.id}`}))`;
      const mesmo = await tx.extratoBancario.findUnique({ where: { contaCorrenteId_arquivoSha256: { contaCorrenteId: conta.id, arquivoSha256: arquivo.sha256 } }, select: { id: true, importadoEm: true } });
      if (mesmo) {
        throw new Conflito(`Este arquivo já foi importado nesta conta em ${diaEmManaus(mesmo.importadoEm).split("-").reverse().join("/")}.`, undefined, { existente: { id: mesmo.id } });
      }
      const novos = await this.movimentosNovos(tx, conta.id, lido.movimentos);

      const extrato = await tx.extratoBancario.create({
        data: {
          companyId: conta.companyId,
          contaCorrenteId: conta.id,
          origem: arquivo.origem,
          arquivoChave: arquivo.chave,
          arquivoNome: arquivo.nome,
          arquivoTamanho: arquivo.tamanho,
          arquivoSha256: arquivo.sha256,
          periodoDe: inicioDoDiaEmManaus(lido.periodo!.de),
          periodoAte: inicioDoDiaEmManaus(lido.periodo!.ate),
          saldoInformado: lido.saldo ? new Prisma.Decimal(lido.saldo.valor) : null,
          saldoInformadoEm: lido.saldo ? inicioDoDiaEmManaus(lido.saldo.em) : null,
          movimentos: lido.movimentos.length,
          novos: novos.length,
          importadoPorId: principal.kind === "user" ? principal.id : null,
          importadoEm: agora,
        },
      });
      if (novos.length > 0) {
        await tx.movimentoDoExtrato.createMany({
          data: novos.map((m) => ({
            companyId: conta.companyId, contaCorrenteId: conta.id, extratoId: extrato.id,
            dia: inicioDoDiaEmManaus(m.dia), valor: new Prisma.Decimal(m.valor), descricao: m.descricao, identificador: m.identificador, tipoNoBanco: m.tipoNoBanco,
          })),
        });
      }
      // Só contagens: o conteúdo do extrato é dado bancário.
      await this.auditoria.append(tx, {
        eventName: "financeiro.extrato.importado",
        entityType: "extrato_bancario",
        entityId: extrato.id,
        companyId: conta.companyId,
        actorType: principal.kind === "user" ? "user" : "agent",
        actorId: principal.id,
        payload: { origem: arquivo.origem, movimentos: lido.movimentos.length, novos: novos.length },
        occurredAt: agora,
      });
      return paraExtrato(extrato, lido.movimentos.length - novos.length);
    });
  }

  /**
   * Os movimentos do arquivo que ainda não entraram na conta. Repetido é só o de mesmo
   * identificador E mesmo conteúdo (dia, valor e descrição). Há bancos que repetem o FITID:
   * com outro conteúdo, no arquivo ou contra o que já entrou, o movimento entra com o
   * identificador sufixado pelo conteúdo, e nada some em silêncio.
   */
  private async movimentosNovos(tx: Prisma.TransactionClient, contaId: string, movimentos: readonly MovimentoLido[]): Promise<MovimentoLido[]> {
    const sufixado = (m: MovimentoLido) => `${m.identificador}~${m.conteudo}`;
    const candidatos = [...new Set(movimentos.flatMap((m) => [m.identificador, sufixado(m)]))];
    const ja = await tx.$queryRaw<{ identificador: string; dia: Date; valor: Prisma.Decimal; descricao: string }[]>`
      SELECT identificador, dia, valor, descricao FROM public.movimentos_do_extrato
      WHERE conta_corrente_id = ${contaId}::uuid AND identificador = ANY(${candidatos}::text[])`;
    const existentes = new Map(ja.map((m) => [m.identificador, conteudoDoMovimento(diaEmManaus(m.dia), m.valor.toFixed(2), m.descricao)]));
    const doArquivo = new Map<string, string>();
    const novos: MovimentoLido[] = [];
    for (const m of movimentos) {
      const conflita = (conteudo: string | undefined) => conteudo !== undefined && conteudo !== m.conteudo;
      const identificador = conflita(existentes.get(m.identificador)) || conflita(doArquivo.get(m.identificador)) ? sufixado(m) : m.identificador;
      if (existentes.get(identificador) === m.conteudo || doArquivo.get(identificador) === m.conteudo) continue;
      doArquivo.set(identificador, m.conteudo);
      novos.push({ ...m, identificador });
    }
    return novos;
  }

  async listar(query: ListarMovimentosDoExtratoQuery): Promise<MovimentosDoExtratoResposta> {
    const de = inicioDoDiaEmManaus(query.de);
    const ate = inicioDoDiaEmManaus(query.ate);
    return this.prisma.comContexto(async (tx) => {
      const [movimentos, extratos] = await Promise.all([
        tx.movimentoDoExtrato.findMany({
          where: { contaCorrenteId: query.contaCorrenteId, dia: { gte: de, lte: ate } },
          orderBy: [{ dia: "desc" }, { identificador: "asc" }],
        }),
        tx.extratoBancario.findMany({
          where: { contaCorrenteId: query.contaCorrenteId, periodoDe: { lte: ate }, periodoAte: { gte: de } },
          orderBy: { importadoEm: "desc" },
        }),
      ]);
      return {
        itens: movimentos.map(paraMovimento),
        extratos: extratos.map((e) => paraExtrato(e, e.movimentos - e.novos)),
      };
    });
  }

  // ------------------------------------------------------------ conciliar (C3)

  async painel(escopo: EscopoDaConciliacao): Promise<PainelDaConciliacao> {
    return this.prisma.comContexto((tx) => this.painelNaTx(tx, escopo));
  }

  /** Concilia o par, com o mesmo valor; senão, 409 com a mensagem pronta. */
  async conciliar(movimentoId: string, lancamentoId: string, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto((tx) => this.conciliarNaTx(tx, movimentoId, lancamentoId, principal, agora));
  }

  /** Concilia os sugeridos do escopo, recalculados aqui (a lista da tela não vale); o par que mudou no meio do caminho fica. */
  async conciliarSugeridos(escopo: EscopoDaConciliacao, principal: AuthPrincipal, agora: Date): Promise<number> {
    return this.prisma.comContexto(async (tx) => {
      const painel = await this.painelNaTx(tx, escopo);
      let conciliados = 0;
      for (const par of painel.sugeridos) {
        try {
          await this.conciliarNaTx(tx, par.movimento.id, par.lancamento.id, principal, agora);
          conciliados += 1;
        } catch (erro) {
          if (!(erro instanceof EstadoInvalido)) throw erro;
        }
      }
      return conciliados;
    });
  }

  /** Desfaz o par (a gerência confere no serviço): o lançamento volta a pago ou recebido, com o motivo na linha do tempo. */
  async desfazer(movimentoId: string, motivo: string, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const movimento = await tx.movimentoDoExtrato.findUnique({ where: { id: movimentoId }, select: { lancamentoId: true } });
      if (!movimento) throw new NaoEncontrado("Linha do extrato não encontrada.");
      if (!movimento.lancamentoId) throw new EstadoInvalido("Esta linha do extrato não está conciliada.");
      const lancamento = await this.travar(tx, movimento.lancamentoId, movimentoId);
      const atual = await tx.movimentoDoExtrato.findUniqueOrThrow({ where: { id: movimentoId }, select: { lancamentoId: true } });
      if (atual.lancamentoId !== lancamento.id) throw new EstadoInvalido("A conciliação desta linha mudou: abra a conciliação de novo.");
      await tx.movimentoDoExtrato.update({ where: { id: movimentoId }, data: { estado: "pendente", lancamentoId: null, conciliadoEm: null, conciliadoPorId: null } });
      const etapa = lancamento.tipo === "saida" ? "paga" : "recebida";
      await tx.lancamento.update({ where: { id: lancamento.id }, data: { etapa, conciliadoEm: null, conciliadoPorId: null } });
      await tx.historicoDeLancamento.create({ data: { lancamentoId: lancamento.id, tipo: "conciliado", porId: principal.id, dados: { acao: "desfeito" }, texto: motivo, em: agora } });
      await this.registrar(tx, "financeiro.lancamento.conciliacao_desfeita", lancamento.id, lancamento.companyId, principal, agora, { comMotivo: true });
      await this.reflexos.aoMudar(tx, { lancamentoId: lancamento.id, empresa: lancamento.companyId, tipo: lancamento.tipo, etapaAntes: "conciliada", mudanca: "desconciliado", porId: principal.id });
    });
  }

  /** "Marcar pendente" e "Retomar": da linha do extrato (pendente ⇄ marcado) ou do lançamento pago sem extrato. */
  async marcar(alvo: { movimentoId: string } | { lancamentoId: string }, marcado: boolean): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      if ("movimentoId" in alvo) {
        const feito = await tx.movimentoDoExtrato.updateMany({ where: { id: alvo.movimentoId, estado: { in: ["pendente", "marcado"] } }, data: { estado: marcado ? "marcado" : "pendente" } });
        if (feito.count === 0) throw new EstadoInvalido("Esta linha do extrato já está conciliada ou não existe.");
        return;
      }
      const feito = await tx.lancamento.updateMany({ where: { id: alvo.lancamentoId, etapa: { in: ["paga", "recebida"] }, canceladoEm: null }, data: { conciliacaoMarcada: marcado } });
      if (feito.count === 0) throw new EstadoInvalido("Só se marca o lançamento pago ou recebido que ainda não foi conciliado.");
    });
  }

  // ------------------------------------------------------------ criar na conciliação (C5)

  /** O que o diálogo "Criar tarifa" já traz: a categoria marcada da empresa e o fornecedor da última tarifa da conta. */
  async sugestaoDaTarifa(movimentoId: string): Promise<SugestaoDaTarifa> {
    return this.prisma.comContexto(async (tx) => {
      const movimento = await tx.movimentoDoExtrato.findUnique({ where: { id: movimentoId } });
      if (!movimento) throw new NaoEncontrado("Linha do extrato não encontrada.");
      const sugestao = await this.sugestaoNaTx(tx, movimento);
      return { movimento: paraMovimento(movimento), ...sugestao };
    });
  }

  /** A tarifa de uma linha de débito: paga e conciliada com ela, numa transação. */
  async criarTarifa(input: CriarTarifa, principal: AuthPrincipal, agora: Date): Promise<LancamentoCriadoNaConciliacao> {
    return this.prisma.comContexto((tx) => this.criarTarifaNaTx(tx, input, principal, agora));
  }

  /**
   * "Criar as N tarifas": uma transação por linha, para a que falha não desfazer as outras nem
   * ficar pela metade. A sugestão da linha (categoria marcada, fornecedor da última tarifa da
   * conta) vem antes; o fornecedor e a categoria do pedido só preenchem o que falta.
   */
  async criarTarifas(movimentoIds: readonly string[], padrao: { fornecedorId?: string; categoriaId?: string }, principal: AuthPrincipal, agora: Date): Promise<{ criadas: number; recusadas: { movimentoId: string; mensagem: string }[] }> {
    let criadas = 0;
    const recusadas: { movimentoId: string; mensagem: string }[] = [];
    for (const movimentoId of movimentoIds) {
      try {
        await this.prisma.comContexto(async (tx) => {
          const movimento = await tx.movimentoDoExtrato.findUnique({ where: { id: movimentoId } });
          if (!movimento) throw new NaoEncontrado("Linha do extrato não encontrada.");
          const sugestao = await this.sugestaoNaTx(tx, movimento);
          const fornecedorId = sugestao.fornecedor?.id ?? padrao.fornecedorId;
          if (!fornecedorId) throw new RequisicaoInvalida("Escolha o fornecedor da tarifa: esta conta ainda não tem tarifa anterior.", [{ campo: "fornecedorId", problema: "Escolha o fornecedor." }]);
          await this.criarTarifaNaTx(tx, { movimentoId, fornecedorId, categoriaId: sugestao.categoria?.id ?? padrao.categoriaId }, principal, agora);
        });
        criadas += 1;
      } catch (erro) {
        if (!(erro instanceof ErroDeDominio)) throw erro;
        recusadas.push({ movimentoId, mensagem: erro.message });
      }
    }
    return { criadas, recusadas };
  }

  /**
   * A criação guiada de uma linha sem par: a despesa (débito; a gerência confere no serviço) ou a
   * receita (crédito), no dia e na conta da linha, já paga ou recebida. Com o valor da linha,
   * conciliada com ela; com outro valor, só com `conciliar: false`, e a linha fica sem par.
   */
  async criarLancamento(input: CriarLancamentoDoExtrato, principal: AuthPrincipal, agora: Date): Promise<LancamentoCriadoNaConciliacao> {
    return this.prisma.comContexto(async (tx) => {
      const movimento = await this.linhaParaCriar(tx, input.movimentoId, input.tipo);
      const daLinha = movimento.valor.abs();
      const valor = input.valor === undefined ? daLinha : new Prisma.Decimal(input.valor);
      if (input.conciliar && !valor.equals(daLinha)) {
        throw new EstadoInvalido(`O valor é diferente do da linha do extrato (${daLinha.toFixed(2)}): use o valor da linha, ou crie sem conciliar.`, [{ campo: "valor", problema: "Diferente do da linha." }]);
      }
      const dia = movimento.dia;
      const comum = {
        companyId: movimento.companyId, contaCorrenteId: movimento.contaCorrenteId, descricao: input.descricao, valor, vencimento: dia,
        origem: "conciliacao" as const, criadoPorId: principal.id,
      };
      let criado: { id: string; numero: number };
      if (input.tipo === "saida") {
        await this.garantirFornecedor(tx, input.fornecedorId);
        if (input.categoriaId) await this.garantirCategoria(tx, input.categoriaId, movimento.companyId, "despesa");
        criado = await tx.lancamento.create({
          data: {
            ...comum, tipo: "saida", fornecedorId: input.fornecedorId, categoriaId: input.categoriaId ?? null, forma: input.forma ?? null, etapa: "paga",
            pagoEm: dia, pagamentoRegistradoEm: agora, pagamentoRegistradoPorId: principal.id,
          },
          select: { id: true, numero: true },
        });
        await this.registrarCriacao(tx, criado.id, movimento.companyId, principal, agora, "saida", "conciliacao", input.forma ?? null);
      } else {
        await this.garantirCliente(tx, input.clienteId);
        await this.garantirCategoria(tx, input.categoriaId, movimento.companyId, "receita");
        criado = await tx.lancamento.create({
          data: {
            ...comum, tipo: "entrada", clientId: input.clienteId, categoriaId: input.categoriaId, competencia: input.competencia ?? diaEmManaus(dia).slice(0, 7),
            etapa: "recebida", recebidoEm: dia, valorRecebido: valor, recebimentoRegistradoEm: agora, recebimentoRegistradoPorId: principal.id,
          },
          select: { id: true, numero: true },
        });
        await this.registrarCriacao(tx, criado.id, movimento.companyId, principal, agora, "entrada", "conciliacao", null);
      }
      if (input.conciliar) await this.conciliarNaTx(tx, movimento.id, criado.id, principal, agora);
      return { lancamento: { id: criado.id, codigo: codigoDoLancamento(input.tipo, criado.numero) }, conciliado: input.conciliar };
    });
  }

  private async criarTarifaNaTx(tx: Prisma.TransactionClient, input: CriarTarifa, principal: AuthPrincipal, agora: Date): Promise<LancamentoCriadoNaConciliacao> {
    const movimento = await this.linhaParaCriar(tx, input.movimentoId, "saida", true);
    const marcada = await tx.categoriaFinanceira.findFirst({ where: { companyId: movimento.companyId, tarifaBancaria: true }, select: { id: true, codigo: true, nome: true } });
    // Sem a categoria de tarifas na empresa, a tarifa não nasce "para classificar": a pessoa escolhe.
    if (marcada && input.categoriaId && input.categoriaId !== marcada.id) {
      const problema = `A tarifa usa a categoria de tarifas da empresa (${marcada.codigo} · ${marcada.nome}). Para usar outra, troque a marca em Configurações › Categorias.`;
      throw new RequisicaoInvalida(problema, [{ campo: "categoriaId", problema }]);
    }
    const categoriaId = marcada?.id ?? input.categoriaId;
    if (!categoriaId) {
      const problema = "Escolha a categoria da tarifa: a empresa ainda não tem a categoria de tarifas bancárias (Configurações › Categorias).";
      throw new RequisicaoInvalida(problema, [{ campo: "categoriaId", problema }]);
    }
    if (!marcada) await this.garantirCategoria(tx, categoriaId, movimento.companyId, "despesa");
    await this.garantirFornecedor(tx, input.fornecedorId);
    const criado = await tx.lancamento.create({
      data: {
        tipo: "saida", companyId: movimento.companyId, contaCorrenteId: movimento.contaCorrenteId, fornecedorId: input.fornecedorId, categoriaId,
        descricao: input.descricao ?? "Tarifa bancária", valor: movimento.valor.abs(), vencimento: movimento.dia, forma: "debito_automatico",
        etapa: "paga", origem: "tarifa_bancaria", criadoPorId: principal.id,
        pagoEm: movimento.dia, pagamentoRegistradoEm: agora, pagamentoRegistradoPorId: principal.id,
      },
      select: { id: true, numero: true },
    });
    await this.registrarCriacao(tx, criado.id, movimento.companyId, principal, agora, "saida", "tarifa_bancaria", "debito_automatico");
    await this.conciliarNaTx(tx, movimento.id, criado.id, principal, agora);
    return { lancamento: { id: criado.id, codigo: codigoDoLancamento("saida", criado.numero) }, conciliado: true };
  }

  /** A linha travada, se ainda pode virar um lançamento do tipo pedido; senão, 409 com quem chegou antes. */
  private async linhaParaCriar(tx: Prisma.TransactionClient, movimentoId: string, tipo: "saida" | "entrada", tarifa = false): Promise<LinhaDoMovimento> {
    await tx.$queryRaw`SELECT id FROM public.movimentos_do_extrato WHERE id = ${movimentoId}::uuid FOR UPDATE`;
    const movimento = await tx.movimentoDoExtrato.findUnique({ where: { id: movimentoId }, include: { conciliadoPor: { select: { name: true } } } });
    if (!movimento) throw new NaoEncontrado("Linha do extrato não encontrada.");
    if (movimento.estado === "conciliado") throw new EstadoInvalido(`Esta linha já foi conciliada${movimento.conciliadoPor ? ` por ${movimento.conciliadoPor.name}` : ""}.`);
    const problema = problemaDaLinhaParaCriar({ valor: movimento.valor.toFixed(2), estado: movimento.estado }, tipo, tarifa);
    if (problema) throw new EstadoInvalido(problema);
    return movimento;
  }

  private async sugestaoNaTx(tx: Prisma.TransactionClient, movimento: LinhaDoMovimento): Promise<Omit<SugestaoDaTarifa, "movimento">> {
    const [categoria, ultima] = await Promise.all([
      tx.categoriaFinanceira.findFirst({ where: { companyId: movimento.companyId, tarifaBancaria: true }, select: { id: true, codigo: true, nome: true } }),
      tx.lancamento.findFirst({
        where: { contaCorrenteId: movimento.contaCorrenteId, origem: "tarifa_bancaria" },
        orderBy: { createdAt: "desc" },
        select: { fornecedor: { select: { id: true, nome: true, ativo: true } } },
      }),
    ]);
    const f = ultima?.fornecedor;
    return { categoria, fornecedor: f?.ativo ? { id: f.id, nome: f.nome } : null };
  }

  /** O evento da criação e o do pagamento (ou recebimento), e os conectores na mesma ordem: criado, depois liquidado. */
  private async registrarCriacao(
    tx: Prisma.TransactionClient, id: string, empresa: string, principal: AuthPrincipal, agora: Date,
    tipo: "saida" | "entrada", origem: "tarifa_bancaria" | "conciliacao", forma: string | null,
  ): Promise<void> {
    const evento = (eventName: NomeDeEventoDoCatalogo, payload: Record<string, unknown>) => this.auditoria.append(tx, {
      eventName, entityType: "lancamento", entityId: id, companyId: empresa,
      actorType: principal.kind === "user" ? "user" : "agent", actorId: principal.id, payload, occurredAt: agora,
    });
    await evento("financeiro.lancamento.created", { tipo, origem });
    await evento(tipo === "saida" ? "financeiro.lancamento.pago" : "financeiro.lancamento.recebido", tipo === "saida" ? { forma } : {});
    // O título vai aos conectores como qualquer outro: criado e, em seguida, pago ou recebido (a baixa).
    const etapaAntes = tipo === "saida" ? "aberta" : "gerada";
    await this.reflexos.aoMudar(tx, { lancamentoId: id, empresa, tipo, etapaAntes, mudanca: "criado", porId: principal.id });
    await this.reflexos.aoMudar(tx, { lancamentoId: id, empresa, tipo, etapaAntes, mudanca: tipo === "saida" ? "pago" : "recebido", porId: principal.id });
  }

  private async garantirFornecedor(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const f = await tx.fornecedor.findUnique({ where: { id }, select: { ativo: true } });
    if (!f) throw new RequisicaoInvalida("Fornecedor não encontrado.", [{ campo: "fornecedorId", problema: "Escolha um fornecedor do cadastro." }]);
    if (!f.ativo) throw new RequisicaoInvalida("Fornecedor inativo.", [{ campo: "fornecedorId", problema: "O fornecedor está inativo." }]);
  }

  private async garantirCategoria(tx: Prisma.TransactionClient, id: string, empresa: string, tipo: "despesa" | "receita"): Promise<void> {
    const c = await tx.categoriaFinanceira.findUnique({ where: { id }, select: { companyId: true, tipo: true, ativa: true } });
    const problema = !c ? "Escolha uma categoria da empresa."
      : c.companyId !== empresa ? "A categoria é de outra empresa."
      : c.tipo !== tipo ? (tipo === "despesa" ? "A despesa usa categoria de despesa." : "A receita usa categoria de receita.")
      : !c.ativa ? "A categoria está inativa." : null;
    if (problema) throw new RequisicaoInvalida(problema, [{ campo: "categoriaId", problema }]);
  }

  /** O cliente pela função do Financeiro (que não lê `clients`): existe e a pessoa alcança. */
  private async garantirCliente(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const achados = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_financeiro(NULL, ${[id]}::uuid[])`;
    if (achados.length === 0) throw new RequisicaoInvalida("Cliente não encontrado.", [{ campo: "clienteId", problema: "Escolha um cliente do cadastro." }]);
  }

  private async painelNaTx(tx: Prisma.TransactionClient, escopo: EscopoDaConciliacao): Promise<PainelDaConciliacao> {
    const de = inicioDoDiaEmManaus(escopo.de);
    const ate = inicioDoDiaEmManaus(escopo.ate);
    const daConta = { ...(escopo.contaCorrenteId ? { contaCorrenteId: escopo.contaCorrenteId } : {}), ...(escopo.empresa ? { companyId: escopo.empresa } : {}) };
    const [movimentos, extratos] = await Promise.all([
      tx.movimentoDoExtrato.findMany({ where: { ...daConta, dia: { gte: de, lte: ate } }, include: { conciliadoPor: { select: { id: true, name: true } } }, orderBy: [{ dia: "desc" }, { identificador: "asc" }] }),
      tx.extratoBancario.findMany({ where: { ...daConta, periodoDe: { lte: ate }, periodoAte: { gte: de } }, orderBy: { importadoEm: "desc" } }),
    ]);
    // Os pagos e recebidos da janela (o período com a folga da sugestão) e os já conciliados com estas linhas.
    const janelaDe = new Date(de.getTime() - JANELA_DA_SUGESTAO_DIAS * DIA_MS);
    const janelaAte = new Date(ate.getTime() + JANELA_DA_SUGESTAO_DIAS * DIA_MS);
    const conciliadosIds = movimentos.map((m) => m.lancamentoId).filter((id): id is string => id !== null);
    const lancamentos = await tx.lancamento.findMany({
      where: {
        ...daConta,
        contaCorrenteId: escopo.contaCorrenteId ?? { not: null },
        canceladoEm: null,
        OR: [{ etapa: { in: ["paga", "recebida"] }, liquidadoEm: { gte: janelaDe, lte: janelaAte } }, { id: { in: conciliadosIds } }],
      },
      select: SELECAO_DO_LANCAMENTO,
    });
    const clientes = await this.nomesDeClientes(tx, lancamentos.map((l) => l.clientId));
    const porId = new Map(lancamentos.map((l) => [l.id, l]));
    const movPorId = new Map(movimentos.map((m) => [m.id, m]));
    const r = montarPainel(movimentos.map(paraRegraDoMovimento), lancamentos.map(paraRegraDoLancamento), { de: escopo.de, ate: escopo.ate });
    const lado = (l: LancamentoParaConciliar) => this.paraLancamento(porId.get(l.id)!, clientes);
    const linha = (m: MovimentoParaConciliar) => paraMovimento(movPorId.get(m.id)!);

    const centavos = (v: string) => BigInt(Math.round(Math.abs(Number(v)) * 100));
    const falta = r.semLancamento.reduce((t, m) => t + centavos(m.valor), 0n)
      + r.sugeridos.reduce((t, [m]) => t + centavos(m.valor), 0n)
      + r.valorDiferente.reduce((t, [m]) => t + centavos(m.valor), 0n)
      + r.semExtrato.reduce((t, l) => t + centavos(l.valorLiquidado), 0n);
    return {
      escopo: { contaCorrenteId: escopo.contaCorrenteId ?? null, empresa: escopo.empresa ?? null, de: escopo.de, ate: escopo.ate },
      resumo: {
        movimentos: movimentos.length, conciliados: r.conciliados.length, sugeridos: r.sugeridos.length, valorDiferente: r.valorDiferente.length,
        semLancamento: r.semLancamento.length, semExtrato: r.semExtrato.length, faltaConciliar: `${falta / 100n}.${(falta % 100n).toString().padStart(2, "0")}`,
      },
      sugeridos: r.sugeridos.map(([m, l]) => ({ movimento: linha(m), lancamento: lado(l) })),
      valorDiferente: r.valorDiferente.map(([m, l, diferenca]) => ({ movimento: linha(m), lancamento: lado(l), diferenca })),
      semLancamento: r.semLancamento.map((m) => ({ ...linha(m), candidatos: r.candidatos.doMovimento.get(m.id) ?? [] })),
      semExtrato: r.semExtrato.map((l) => ({ ...lado(l), candidatos: r.candidatos.doLancamento.get(l.id) ?? [] })),
      // Os candidatos de fora do período (a janela de ±3 dias), que não estão em semExtrato.
      lancamentosCandidatos: [...new Set([...r.candidatos.doMovimento.values()].flat())]
        .filter((id) => !r.semExtrato.some((l) => l.id === id))
        .map((id) => this.paraLancamento(porId.get(id)!, clientes)),
      conciliados: r.conciliados.map(([m, l]) => {
        const doBanco = movPorId.get(m.id)!;
        return {
          movimento: linha(m), lancamento: lado(l), conciliadoEm: (doBanco.conciliadoEm ?? new Date(0)).toISOString(),
          conciliadoPor: doBanco.conciliadoPor ? { id: doBanco.conciliadoPor.id, nome: doBanco.conciliadoPor.name } : null,
        };
      }),
      extratos: extratos.map((e) => paraExtrato(e, e.movimentos - e.novos)),
    };
  }

  private async conciliarNaTx(tx: Prisma.TransactionClient, movimentoId: string, lancamentoId: string, principal: AuthPrincipal, agora: Date): Promise<void> {
    const lancamento = await this.travar(tx, lancamentoId, movimentoId);
    const movimento = await tx.movimentoDoExtrato.findUnique({ where: { id: movimentoId }, include: { conciliadoPor: { select: { name: true } } } });
    if (!movimento) throw new NaoEncontrado("Linha do extrato não encontrada.");
    // Quem chegou antes, com o nome, para a pessoa entender o 409.
    if (movimento.estado === "conciliado") throw new EstadoInvalido(`Esta linha já foi conciliada${movimento.conciliadoPor ? ` por ${movimento.conciliadoPor.name}` : ""}.`);
    if (lancamento.etapa === "conciliada") {
      const por = (await tx.lancamento.findUnique({ where: { id: lancamentoId }, select: { conciliadoPor: { select: { name: true } } } }))?.conciliadoPor?.name;
      throw new EstadoInvalido(`Este lançamento já foi conciliado${por ? ` por ${por}` : ""}.`);
    }
    const problema = problemaDoPar(paraRegraDoMovimento(movimento), paraRegraDoLancamento(lancamento));
    if (problema) throw new EstadoInvalido(problema);
    await tx.movimentoDoExtrato.update({ where: { id: movimentoId }, data: { estado: "conciliado", lancamentoId, conciliadoEm: agora, conciliadoPorId: principal.kind === "user" ? principal.id : null } });
    await tx.lancamento.update({ where: { id: lancamentoId }, data: { etapa: "conciliada", conciliadoEm: agora, conciliadoPorId: principal.kind === "user" ? principal.id : null, conciliacaoMarcada: false } });
    await this.registrar(tx, "financeiro.lancamento.conciliado", lancamentoId, lancamento.companyId, principal, agora, { tipo: lancamento.tipo });
    await this.reflexos.aoMudar(tx, { lancamentoId, empresa: lancamento.companyId, tipo: lancamento.tipo, etapaAntes: lancamento.etapa, mudanca: "conciliado", porId: principal.id });
  }

  /** Trava o lançamento antes da linha do extrato: a mesma ordem do resto do Financeiro. */
  private async travar(tx: Prisma.TransactionClient, lancamentoId: string, movimentoId: string): Promise<LinhaDoLancamento> {
    const travados = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.lancamentos WHERE id = ${lancamentoId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.movimentos_do_extrato WHERE id = ${movimentoId}::uuid FOR UPDATE`;
    const lancamento = travados.length === 0 ? null : await tx.lancamento.findUnique({ where: { id: lancamentoId }, select: SELECAO_DO_LANCAMENTO });
    if (!lancamento) throw new NaoEncontrado("Lançamento não encontrado.");
    return lancamento;
  }

  private paraLancamento(l: LinhaDoLancamento, clientes: Map<string, string>): LancamentoNaConciliacao {
    return {
      id: l.id, tipo: l.tipo, codigo: codigoDoLancamento(l.tipo, l.numero), empresa: l.companyId as CompanyKey, contaCorrenteId: l.contaCorrenteId!,
      favorecido: l.tipo === "saida" ? (l.fornecedor?.nome ?? "Fornecedor") : ((l.clientId && clientes.get(l.clientId)) || "Cliente"),
      descricao: l.descricao, valor: valorLiquidado(l), liquidadoEm: diaEmManaus(l.liquidadoEm!), marcado: l.conciliacaoMarcada,
    };
  }

  /** O Financeiro não lê `clients` (é do CRM): só o nome, pela função. */
  private async nomesDeClientes(tx: Prisma.TransactionClient, ids: (string | null)[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_financeiro(NULL, ${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private registrar(tx: Prisma.TransactionClient, eventName: "financeiro.lancamento.conciliado" | "financeiro.lancamento.conciliacao_desfeita", lancamentoId: string, companyId: string, principal: AuthPrincipal, agora: Date, payload: Record<string, unknown>): Promise<void> {
    return this.auditoria.append(tx, {
      eventName, entityType: "lancamento", entityId: lancamentoId, companyId,
      actorType: principal.kind === "user" ? "user" : "agent", actorId: principal.id, payload, occurredAt: agora,
    });
  }
}
