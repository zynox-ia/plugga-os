import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type SituacaoDoMonitoramento } from "@prisma/client";
import type { CompanyKey, CriarPlataforma, CriarUsina, EditarPlataforma, EditarUsina, ImportacaoDeUsinas, ListarUsinasQuery } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ENCERRADAS } from "./engenharia.rules";
import { codigoDeUc, nomeComparavel, type LinhaNormalizada } from "./importacao-de-usinas";
import { idDaPlataforma, kwpCurto } from "./usinas.rules";

export type Nomes = ReadonlyMap<string, string>;
export type ArquivoGuardado = { chave: string; nome: string; tamanho: number; tipo: string };

export const SELECT_DA_USINA = {
  id: true,
  companyId: true,
  clientId: true,
  consumerUnitId: true,
  nome: true,
  potenciaKwp: true,
  fabricante: true,
  modelo: true,
  numeroSerie: true,
  comissionadaEm: true,
  garantiaAte: true,
  origem: true,
  ativa: true,
  criadoPorId: true,
  createdAt: true,
  plataforma: { select: { id: true, nome: true } },
  _count: { select: { ordensDeServico: { where: { situacao: { notIn: [...ENCERRADAS] } } } } },
} satisfies Prisma.UsinaSelect;
export type LinhaDaUsina = Prisma.UsinaGetPayload<{ select: typeof SELECT_DA_USINA }>;

const SELECT_DO_RESULTADO = {
  situacao: true,
  nota: true,
  usinaId: true,
  ordemDeServico: { select: { id: true, numero: true } },
  conferencia: { select: { dia: true, conferidaEm: true, conferidaPorId: true } },
} satisfies Prisma.ResultadoDaConferenciaSelect;
export type LinhaDoResultado = Prisma.ResultadoDaConferenciaGetPayload<{ select: typeof SELECT_DO_RESULTADO }>;

/** Exceção da conferência que abre O.S.: a O.S. é criada pelo repositório das O.S., na mesma transação. */
export type ExcecaoComOrdem = { usinaId: string; situacao: Exclude<SituacaoDoMonitoramento, "normal">; nota: string };

const DIAS_DE_MONITORAMENTO_NA_FICHA = 90;

/**
 * Persistência das Usinas, das plataformas e do monitoramento do dia (PLU-347).
 * Nomes de clientes, UCs e pessoas vêm das funções de segurança da Engenharia.
 */
@Injectable()
export class PrismaUsinasRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  // ------------------------------------------------------------ plataformas

  async plataformas(): Promise<{ id: string; nome: string; observacaoDeAcesso: string | null; ativa: boolean; ordem: number; usinas: number; potencias: string[] }[]> {
    return this.prisma.comContexto(async (tx) => {
      const [plataformas, usinas] = await Promise.all([
        tx.plataformaDeInversor.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
        tx.usina.findMany({ where: { ativa: true }, select: { plataformaId: true, potenciaKwp: true } }),
      ]);
      return plataformas.map((p) => {
        const dela = usinas.filter((u) => u.plataformaId === p.id);
        return { id: p.id, nome: p.nome, observacaoDeAcesso: p.observacaoDeAcesso, ativa: p.ativa, ordem: p.ordem, usinas: dela.length, potencias: dela.map((u) => u.potenciaKwp.toString()) };
      });
    });
  }

  async criarPlataforma(input: CriarPlataforma, principal: AuthPrincipal): Promise<void> {
    const id = idDaPlataforma(input.nome);
    if (!id) throw new RequisicaoInvalida("Nome de plataforma inválido.", [{ campo: "nome", problema: "Use letras ou números." }]);
    await this.comUnicidade("Já existe uma plataforma com esse nome.", () => this.prisma.comContexto(async (tx) => {
      const ultima = await tx.plataformaDeInversor.aggregate({ _max: { ordem: true } });
      await tx.plataformaDeInversor.create({ data: { id, nome: input.nome, observacaoDeAcesso: input.observacaoDeAcesso ?? null, ordem: (ultima._max.ordem ?? 0) + 1 } });
      await this.registrar(tx, "engenharia.plataforma.configurada", "plataforma_de_inversor", id, null, principal, { acao: "criada" });
    }));
  }

  async editarPlataforma(id: string, input: EditarPlataforma, principal: AuthPrincipal): Promise<void> {
    await this.comUnicidade("Já existe uma plataforma com esse nome.", () => this.prisma.comContexto(async (tx) => {
      const atual = await tx.plataformaDeInversor.findUnique({ where: { id }, select: { id: true } });
      if (!atual) throw new NaoEncontrado("Plataforma não encontrada.");
      await tx.plataformaDeInversor.update({
        where: { id },
        data: {
          ...(input.nome !== undefined ? { nome: input.nome } : {}),
          ...(input.observacaoDeAcesso !== undefined ? { observacaoDeAcesso: input.observacaoDeAcesso } : {}),
          ...(input.ativa !== undefined ? { ativa: input.ativa } : {}),
        },
      });
      await this.registrar(tx, "engenharia.plataforma.configurada", "plataforma_de_inversor", id, null, principal, { acao: "alterada", campos: Object.keys(input).sort() });
    }));
  }

  // ------------------------------------------------------------ usinas

  async usinas(query: ListarUsinasQuery): Promise<{ linhas: LinhaDaUsina[]; total: number; ultimos: Map<string, LinhaDoResultado>; clientes: Nomes; ucs: Map<string, { codigo: string; distribuidora: string }>; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const filtros: Prisma.UsinaWhereInput[] = [];
      if (query.inativas !== "incluir") filtros.push({ ativa: true });
      if (query.empresa) filtros.push({ companyId: query.empresa });
      if (query.plataformaId) filtros.push({ plataformaId: query.plataformaId });
      if (query.busca) {
        const clientes = query.busca.trim().length >= 2
          ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_engenharia(${query.busca}, NULL::uuid[])`
          : [];
        filtros.push({ OR: [{ nome: { contains: query.busca, mode: "insensitive" } }, ...(clientes.length > 0 ? [{ clientId: { in: clientes.map((c) => c.id) } }] : [])] });
      }
      let linhas = await tx.usina.findMany({ where: { AND: filtros }, select: SELECT_DA_USINA, orderBy: [{ nome: "asc" }], take: 1000 });
      const ultimos = await this.ultimosResultados(tx, linhas.map((l) => l.id));
      if (query.atencao === "sim") linhas = linhas.filter((l) => ultimos.get(l.id) && ultimos.get(l.id)!.situacao !== "normal");
      return { linhas, total: linhas.length, ultimos, ...(await this.nomesDasUsinas(tx, linhas, [...ultimos.values()].flatMap((r) => (r.conferencia.conferidaPorId ? [r.conferencia.conferidaPorId] : [])))) };
    });
  }

  async ficha(id: string, agora: Date): Promise<{
    linha: LinhaDaUsina; ultimo: LinhaDoResultado | null; historico: LinhaDoResultado[];
    ordens: { id: string; numero: number; tipo: string; situacao: string; descricao: string; createdAt: Date }[];
    clientes: Nomes; ucs: Map<string, { codigo: string; distribuidora: string }>; pessoas: Nomes;
  }> {
    return this.prisma.comContexto(async (tx) => {
      const linha = await tx.usina.findUnique({ where: { id }, select: SELECT_DA_USINA });
      if (!linha) throw new NaoEncontrado("Usina não encontrada.");
      const desde = inicioDoDiaEmManaus(diaEmManaus(new Date(agora.getTime() - DIAS_DE_MONITORAMENTO_NA_FICHA * 86_400_000)));
      const [historico, ordens] = await Promise.all([
        tx.resultadoDaConferencia.findMany({ where: { usinaId: id, conferencia: { dia: { gte: desde } } }, select: SELECT_DO_RESULTADO, orderBy: { conferencia: { dia: "desc" } } }),
        tx.ordemDeServico.findMany({ where: { usinaId: id }, select: { id: true, numero: true, tipo: true, situacao: true, descricao: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
      ]);
      const pessoas = [linha.criadoPorId, ...historico.map((h) => h.conferencia.conferidaPorId)].filter((p): p is string => p !== null);
      return { linha, ultimo: historico[0] ?? null, historico, ordens, ...(await this.nomesDasUsinas(tx, [linha], pessoas)) };
    });
  }

  async criarUsina(input: CriarUsina, principal: AuthPrincipal, agora: Date): Promise<string> {
    if (input.comissionadaEm > diaEmManaus(agora)) throw new RequisicaoInvalida("O comissionamento não pode estar no futuro.", [{ campo: "comissionadaEm", problema: "Use a data em que a usina foi ligada." }]);
    return this.comUnicidade("Essa UC já tem uma usina ativa com esse nome.", () => this.prisma.comContexto(async (tx) => {
      await this.garantirUcDoCliente(tx, input.clienteId, input.ucId);
      await this.garantirPlataformaAtiva(tx, input.plataformaId);
      if (input.ordemDeComissionamentoId) {
        const ordem = await tx.ordemDeServico.findUnique({ where: { id: input.ordemDeComissionamentoId }, select: { tipo: true, situacao: true, clientId: true } });
        if (!ordem || ordem.tipo !== "comissionamento" || ordem.situacao !== "concluida" || ordem.clientId !== input.clienteId) {
          throw new RequisicaoInvalida("A O.S. de origem precisa ser um comissionamento concluído do mesmo cliente.", [{ campo: "ordemDeComissionamentoId", problema: "Escolha a O.S. de comissionamento do cliente." }]);
        }
        // Uma usina por comissionamento; o índice único parcial garante sob concorrência.
        const jaTem = await tx.usina.findFirst({ where: { ordemDeComissionamentoId: input.ordemDeComissionamentoId }, select: { id: true } });
        if (jaTem) throw new Conflito("Essa O.S. de comissionamento já tem usina cadastrada.");
      }
      const criada = await tx.usina.create({
        data: {
          companyId: input.empresa,
          clientId: input.clienteId,
          consumerUnitId: input.ucId,
          nome: input.nome,
          plataformaId: input.plataformaId,
          potenciaKwp: input.potenciaKwp,
          fabricante: input.fabricante ?? null,
          modelo: input.modelo ?? null,
          numeroSerie: input.numeroSerie ?? null,
          comissionadaEm: inicioDoDiaEmManaus(input.comissionadaEm),
          garantiaAte: input.garantiaAte ? inicioDoDiaEmManaus(input.garantiaAte) : null,
          origem: input.ordemDeComissionamentoId ? "comissionamento" : "manual",
          ordemDeComissionamentoId: input.ordemDeComissionamentoId ?? null,
          criadoPorId: principal.id,
        },
        select: { id: true },
      });
      await this.registrar(tx, "engenharia.usina.created", "usina", criada.id, input.empresa, principal, { plataformaId: input.plataformaId, origem: input.ordemDeComissionamentoId ? "comissionamento" : "manual" });
      return criada.id;
    }));
  }

  async editarUsina(id: string, input: EditarUsina, principal: AuthPrincipal, agora: Date): Promise<void> {
    if (input.comissionadaEm && input.comissionadaEm > diaEmManaus(agora)) throw new RequisicaoInvalida("O comissionamento não pode estar no futuro.", [{ campo: "comissionadaEm", problema: "Use a data em que a usina foi ligada." }]);
    await this.comUnicidade("Essa UC já tem uma usina ativa com esse nome.", () => this.prisma.comContexto(async (tx) => {
      const atual = await tx.usina.findUnique({ where: { id }, select: { companyId: true } });
      if (!atual) throw new NaoEncontrado("Usina não encontrada.");
      if (input.plataformaId) await this.garantirPlataformaAtiva(tx, input.plataformaId);
      const { comissionadaEm, garantiaAte, ...resto } = input;
      await tx.usina.update({
        where: { id },
        data: {
          ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)),
          ...(comissionadaEm !== undefined ? { comissionadaEm: inicioDoDiaEmManaus(comissionadaEm) } : {}),
          ...(garantiaAte !== undefined ? { garantiaAte: garantiaAte ? inicioDoDiaEmManaus(garantiaAte) : null } : {}),
        },
      });
      await this.registrar(tx, "engenharia.usina.updated", "usina", id, atual.companyId, principal, { campos: Object.keys(input).sort() });
    }));
  }

  /**
   * Importação da planilha (E3): casa cada linha com o cliente (nome exato), a UC
   * do cliente (código) e a plataforma (nome ou id); marca as que já existem
   * (mesma UC e nome) e as repetidas na planilha. Com `gravar`, cria as prontas
   * numa transação só, com a origem "importacao". Sem data de comissionamento,
   * vale o dia da importação.
   */
  async importar(linhas: LinhaNormalizada[], gravar: boolean, principal: AuthPrincipal, agora: Date): Promise<ImportacaoDeUsinas> {
    const hoje = diaEmManaus(agora);
    return this.prisma.comContexto(async (tx) => {
      const plataformas = await tx.plataformaDeInversor.findMany({ where: { ativa: true }, select: { id: true, nome: true } });
      const plataformaDe = (valor: string) => plataformas.find((p) => nomeComparavel(p.nome) === nomeComparavel(valor) || p.id === idDaPlataforma(valor));
      // Todos os clientes da planilha numa consulta só, pelo nome exato.
      const nomes = [...new Set(linhas.map((l) => l.cliente.trim()).filter((n) => n.length > 0))];
      const achados = nomes.length === 0 ? [] : await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_engenharia_por_nome(${nomes}::text[])`;
      const clientes = new Map<string, { id: string; nome: string }[]>();
      for (const c of achados) {
        const chave = nomeComparavel(c.name);
        clientes.set(chave, [...(clientes.get(chave) ?? []), { id: c.id, nome: c.name }]);
      }
      const idsDeClientes = [...new Set([...clientes.values()].flat().map((c) => c.id))];
      const ucs = idsDeClientes.length === 0 ? [] : await tx.$queryRaw<{ id: string; client_id: string; code: string }[]>`
        SELECT id, client_id, code FROM plugga_security.ucs_para_engenharia(${idsDeClientes}::uuid[])`;
      const existentes = ucs.length === 0 ? [] : await tx.usina.findMany({ where: { ativa: true, consumerUnitId: { in: ucs.map((u) => u.id) } }, select: { consumerUnitId: true, nome: true } });
      const vistas = new Set<string>();
      const resultado: ImportacaoDeUsinas["linhas"] = [];
      const prontas: { linha: LinhaNormalizada; clienteId: string; ucId: string; plataformaId: string; empresa: CompanyKey }[] = [];
      for (const l of linhas) {
        const problemas = [...l.problemas];
        const candidatos = clientes.get(nomeComparavel(l.cliente)) ?? [];
        if (l.cliente && candidatos.length === 0) problemas.push("cliente não encontrado no cadastro (nome exato)");
        if (candidatos.length > 1) problemas.push("mais de um cliente com esse nome");
        const cliente = candidatos.length === 1 ? candidatos[0]! : null;
        const uc = cliente ? ucs.find((u) => u.client_id === cliente.id && codigoDeUc(u.code) === codigoDeUc(l.uc)) : undefined;
        if (cliente && l.uc && !uc) problemas.push("UC não é do cliente");
        const plataforma = l.plataforma ? plataformaDe(l.plataforma) : undefined;
        if (l.plataforma && !plataforma) problemas.push("plataforma desconhecida");
        const chave = uc ? `${uc.id}|${nomeComparavel(l.nome)}` : null;
        if (chave && vistas.has(chave)) problemas.push("usina repetida na planilha");
        const jaExiste = uc ? existentes.some((e) => e.consumerUnitId === uc.id && nomeComparavel(e.nome) === nomeComparavel(l.nome)) : false;
        const usina = cliente && uc && plataforma && l.potenciaKwp && l.empresa
          ? { nome: l.nome, cliente: cliente.nome, uc: uc.code, plataforma: plataforma.nome, potenciaKwp: kwpCurto(l.potenciaKwp), empresa: l.empresa }
          : null;
        if (chave) vistas.add(chave);
        const situacao = problemas.length > 0 ? "erro" : jaExiste ? "ja_existe" : "pronta";
        resultado.push({ linha: l.linha, situacao, problemas, usina });
        if (situacao === "pronta") prontas.push({ linha: l, clienteId: cliente!.id, ucId: uc!.id, plataformaId: plataforma!.id, empresa: l.empresa! });
      }
      if (gravar && prontas.length > 0) {
        // Em lote: uma inserção das usinas e uma dos eventos.
        const criadas = await tx.usina.createManyAndReturn({
          data: prontas.map((p) => ({
            companyId: p.empresa, clientId: p.clienteId, consumerUnitId: p.ucId, nome: p.linha.nome, plataformaId: p.plataformaId, potenciaKwp: p.linha.potenciaKwp!,
            fabricante: p.linha.fabricante, modelo: p.linha.modelo, numeroSerie: p.linha.numeroSerie,
            comissionadaEm: inicioDoDiaEmManaus(p.linha.comissionadaEm ?? hoje), origem: "importacao" as const, criadoPorId: principal.id,
          })),
          select: { id: true, companyId: true, plataformaId: true },
        });
        await this.auditoria.appendMany(tx, criadas.map((c) => ({
          eventName: "engenharia.usina.created" as const,
          entityType: "usina",
          entityId: c.id,
          companyId: c.companyId,
          actorType: principal.kind === "user" ? ("user" as const) : ("agent" as const),
          actorId: principal.id,
          payload: { plataformaId: c.plataformaId, origem: "importacao" },
          occurredAt: new Date(),
        })));
      }
      if (gravar) for (const r of resultado) if (r.situacao === "pronta") r.situacao = "gravada";
      return {
        gravou: gravar,
        resumo: {
          linhas: resultado.length,
          prontas: gravar ? 0 : prontas.length,
          jaExistem: resultado.filter((r) => r.situacao === "ja_existe").length,
          erros: resultado.filter((r) => r.situacao === "erro").length,
          gravadas: gravar ? prontas.length : 0,
        },
        linhas: resultado,
      };
      // Planilha grande (até 2000 linhas): mais que os 5 s padrão da transação interativa.
    }, { timeout: 60_000 });
  }

  // ------------------------------------------------------------ monitoramento

  /** As usinas ativas por plataforma (ativa) e empresa, e as conferências do dia com as exceções. */
  async monitoramento(empresa: CompanyKey | undefined, dia: string): Promise<{
    usinas: { id: string; nome: string; companyId: string; clientId: string; potenciaKwp: string; fabricante: string | null; plataforma: { id: string; nome: string; ordem: number } }[];
    conferencias: { id: string; plataformaId: string; companyId: string; conferidaPorId: string | null; conferidaEm: Date; printNome: string; printTamanho: number; printTipo: string;
      resultados: { usinaId: string; situacao: SituacaoDoMonitoramento; nota: string | null; ordemDeServico: { id: string; numero: number } | null }[] }[];
    clientes: Nomes; pessoas: Nomes;
  }> {
    return this.prisma.comContexto(async (tx) => {
      const [usinas, conferencias] = await Promise.all([
        tx.usina.findMany({
          where: { ativa: true, plataforma: { ativa: true }, ...(empresa ? { companyId: empresa } : {}) },
          select: { id: true, nome: true, companyId: true, clientId: true, potenciaKwp: true, fabricante: true, plataforma: { select: { id: true, nome: true, ordem: true } } },
          orderBy: { nome: "asc" },
        }),
        tx.conferenciaDePlataforma.findMany({
          where: { dia: inicioDoDiaEmManaus(dia), ...(empresa ? { companyId: empresa } : {}) },
          select: {
            id: true, plataformaId: true, companyId: true, conferidaPorId: true, conferidaEm: true, printNome: true, printTamanho: true, printTipo: true,
            resultados: { select: { usinaId: true, situacao: true, nota: true, ordemDeServico: { select: { id: true, numero: true } } } },
          },
        }),
      ]);
      const [clientes, pessoas] = await Promise.all([
        this.nomesDeClientes(tx, usinas.map((u) => u.clientId)),
        this.nomesDePessoas(tx, conferencias.flatMap((c) => (c.conferidaPorId ? [c.conferidaPorId] : []))),
      ]);
      return { usinas: usinas.map((u) => ({ ...u, potenciaKwp: u.potenciaKwp.toString() })), conferencias, clientes, pessoas };
    });
  }

  /**
   * Grava a conferência do dia de uma plataforma para uma empresa: o print, o
   * resultado de cada usina ativa (as que não vierem contam como normais) e, para
   * as exceções com O.S., a O.S. criada por `abrirOrdem`, na mesma transação.
   */
  async conferir(
    dados: {
      plataformaId: string;
      empresa: CompanyKey;
      dia: string;
      resultados: { usinaId: string; situacao: SituacaoDoMonitoramento; nota: string | null; abrirOs: boolean }[];
      print: ArquivoGuardado;
    },
    principal: AuthPrincipal,
    agora: Date,
    abrirOrdem: (usina: { id: string; clientId: string; consumerUnitId: string; fabricante: string | null; modelo: string | null; numeroSerie: string | null; nome: string }, excecao: ExcecaoComOrdem) => Promise<string>,
  ): Promise<string> {
    return this.comUnicidade("Esta plataforma já foi conferida hoje para esta empresa.", () => this.prisma.comContexto(async (tx) => {
      await this.garantirPlataformaAtiva(tx, dados.plataformaId);
      const usinas = await tx.usina.findMany({
        where: { plataformaId: dados.plataformaId, companyId: dados.empresa, ativa: true },
        select: { id: true, clientId: true, consumerUnitId: true, fabricante: true, modelo: true, numeroSerie: true, nome: true },
      });
      if (usinas.length === 0) throw new EstadoInvalido("A plataforma não tem usina ativa desta empresa para conferir.");
      const fora = dados.resultados.filter((r) => !usinas.some((u) => u.id === r.usinaId));
      if (fora.length > 0) throw new RequisicaoInvalida("Há usina que não é desta plataforma e empresa.", [{ campo: "resultados", problema: "Confira só as usinas da plataforma." }]);
      const conferencia = await tx.conferenciaDePlataforma.create({
        data: {
          plataformaId: dados.plataformaId, companyId: dados.empresa, dia: inicioDoDiaEmManaus(dados.dia), conferidaPorId: principal.id, conferidaEm: agora,
          printChave: dados.print.chave, printNome: dados.print.nome, printTamanho: dados.print.tamanho, printTipo: dados.print.tipo,
        },
        select: { id: true },
      });
      let ordens = 0;
      for (const usina of usinas) {
        const r = dados.resultados.find((x) => x.usinaId === usina.id);
        const situacao = r?.situacao ?? "normal";
        let ordemDeServicoId: string | null = null;
        if (r && r.situacao !== "normal" && r.abrirOs) {
          ordemDeServicoId = await abrirOrdem(usina, { usinaId: usina.id, situacao: r.situacao, nota: r.nota ?? "" });
          ordens += 1;
        }
        await tx.resultadoDaConferencia.create({ data: { conferenciaId: conferencia.id, usinaId: usina.id, situacao, nota: r?.nota ?? null, ordemDeServicoId } });
      }
      const excecoes = dados.resultados.filter((r) => r.situacao !== "normal").length;
      // Sem o nome do print nem as notas: o print pode mostrar dados de cliente.
      await this.registrar(tx, "engenharia.plataforma.conferida", "conferencia_de_plataforma", conferencia.id, dados.empresa, principal, {
        plataformaId: dados.plataformaId, dia: dados.dia, usinas: usinas.length, excecoes, ordens,
      });
      return conferencia.id;
    }));
  }

  async printDaConferencia(id: string): Promise<ArquivoGuardado> {
    const linha = await this.prisma.comContexto((tx) => tx.conferenciaDePlataforma.findUnique({ where: { id }, select: { printChave: true, printNome: true, printTamanho: true, printTipo: true } }));
    if (!linha) throw new NaoEncontrado("Conferência não encontrada.");
    return { chave: linha.printChave, nome: linha.printNome, tamanho: linha.printTamanho, tipo: linha.printTipo };
  }

  /** Para a Visão geral: quantas (plataforma, empresa) do dia têm conferência, quais faltam e as usinas com atenção. */
  async resumoDoDia(empresa: CompanyKey | undefined, dia: string): Promise<{ total: number; conferidas: number; pendentes: { plataforma: string; empresa: string }[]; usinasComAtencao: number }> {
    const { usinas, conferencias } = await this.monitoramento(empresa, dia);
    const pares = new Map<string, { plataforma: string; empresa: string }>();
    for (const u of usinas) pares.set(`${u.plataforma.id}|${u.companyId}`, { plataforma: u.plataforma.nome, empresa: u.companyId });
    const feitas = new Set(conferencias.map((c) => `${c.plataformaId}|${c.companyId}`));
    const pendentes = [...pares.entries()].filter(([chave]) => !feitas.has(chave)).map(([, p]) => p);
    const usinasComAtencao = await this.prisma.comContexto(async (tx) => {
      const ultimos = await this.ultimosResultados(tx, usinas.map((u) => u.id));
      return [...ultimos.values()].filter((r) => r.situacao !== "normal").length;
    });
    return { total: pares.size, conferidas: pares.size - pendentes.length, pendentes, usinasComAtencao };
  }

  async usinaParaOrdem(tx: Prisma.TransactionClient, usinaId: string): Promise<{ clientId: string; ativa: boolean; fabricante: string | null; modelo: string | null; numeroSerie: string | null } | null> {
    return tx.usina.findUnique({ where: { id: usinaId }, select: { clientId: true, ativa: true, fabricante: true, modelo: true, numeroSerie: true } });
  }

  // ------------------------------------------------------------ apoio

  /** O resultado mais recente de cada usina. */
  private async ultimosResultados(tx: Prisma.TransactionClient, usinas: string[]): Promise<Map<string, LinhaDoResultado>> {
    if (usinas.length === 0) return new Map();
    const linhas = await tx.resultadoDaConferencia.findMany({
      where: { usinaId: { in: usinas } },
      select: SELECT_DO_RESULTADO,
      orderBy: [{ conferencia: { dia: "desc" } }, { conferencia: { conferidaEm: "desc" } }],
      distinct: ["usinaId"],
    });
    return new Map(linhas.map((l) => [l.usinaId, l]));
  }

  private async nomesDasUsinas(tx: Prisma.TransactionClient, linhas: LinhaDaUsina[], outrasPessoas: string[]) {
    const [clientes, ucs, pessoas] = await Promise.all([
      this.nomesDeClientes(tx, linhas.map((l) => l.clientId)),
      this.ucs(tx, linhas.map((l) => l.clientId)),
      this.nomesDePessoas(tx, [...linhas.flatMap((l) => (l.criadoPorId ? [l.criadoPorId] : [])), ...outrasPessoas]),
    ]);
    return { clientes, ucs, pessoas };
  }

  private async garantirUcDoCliente(tx: Prisma.TransactionClient, clienteId: string, ucId: string): Promise<void> {
    const ucs = await this.ucs(tx, [clienteId]);
    if (!ucs.has(ucId)) throw new RequisicaoInvalida("A UC não é do cliente.", [{ campo: "ucId", problema: "Escolha uma UC do cliente." }]);
  }

  private async garantirPlataformaAtiva(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const plataforma = await tx.plataformaDeInversor.findUnique({ where: { id }, select: { ativa: true } });
    if (!plataforma || !plataforma.ativa) throw new RequisicaoInvalida("Plataforma não encontrada ou inativa.", [{ campo: "plataformaId", problema: "Escolha uma plataforma ativa." }]);
  }

  private async ucs(tx: Prisma.TransactionClient, clientes: string[]): Promise<Map<string, { codigo: string; distribuidora: string }>> {
    const unicos = [...new Set(clientes)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; code: string; distributor: string }[]>`SELECT id, code, distributor FROM plugga_security.ucs_para_engenharia(${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, { codigo: l.code, distribuidora: l.distributor }]));
  }

  private async nomesDeClientes(tx: Prisma.TransactionClient, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_engenharia(NULL, ${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private async nomesDePessoas(tx: Prisma.TransactionClient, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.pessoas_da_engenharia(${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  /** Violação de unicidade (nome de plataforma, usina por UC, conferência do dia) vira 409 com a mensagem certa. */
  private async comUnicidade<T>(mensagem: string, gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw new Conflito(mensagem);
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") throw new RequisicaoInvalida("Cliente, UC ou plataforma não encontrados.", [{ campo: "clienteId", problema: "Escolha do cadastro." }]);
      throw erro;
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: "engenharia.usina.created" | "engenharia.usina.updated" | "engenharia.plataforma.configurada" | "engenharia.plataforma.conferida",
    entityType: string,
    entityId: string,
    companyId: string | null,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      ...(companyId ? { companyId } : {}),
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
