import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  regraDeRecorrenciaSchema,
  semanaDe,
  somarDias,
  type AutomacaoDeTarefa,
  type CriarTarefa,
  type DepartamentoComTarefas,
  type ListarTarefasQuery,
  type RegraDeRecorrencia,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { diasParaGerar, marcasDoChecklist, prazoDaOcorrencia } from "./tarefas.rules";

export type ArquivoGuardado = { chave: string; nome: string; tamanho: number; tipo: string };
export type Nomes = ReadonlyMap<string, string>;

export const SELECT_DA_TAREFA = {
  id: true,
  departamento: true,
  titulo: true,
  categoria: true,
  empresa: true,
  responsavelId: true,
  substitutoId: true,
  tipo: true,
  origem: true,
  regra: true,
  dia: true,
  horarioLimite: true,
  exigeEvidencia: true,
  exigeResultado: true,
  instrucoes: true,
  automacao: true,
  atalho: true,
  encerradaEm: true,
  encerradaPorId: true,
  encerramentoMotivo: true,
  criadoPorId: true,
  createdAt: true,
} satisfies Prisma.TarefaSelect;
export type LinhaDaTarefa = Prisma.TarefaGetPayload<{ select: typeof SELECT_DA_TAREFA }>;

export const INCLUDE_DA_OCORRENCIA = {
  tarefa: { select: SELECT_DA_TAREFA },
  evidencias: { orderBy: { enviadoEm: "asc" } },
} satisfies Prisma.OcorrenciaDeTarefaInclude;
export type LinhaDaOcorrencia = Prisma.OcorrenciaDeTarefaGetPayload<{ include: typeof INCLUDE_DA_OCORRENCIA }>;

/** Quanto do passado a lista lê das concluídas; as não concluídas vêm todas (são as atrasadas). */
const DIAS_DE_CONCLUIDAS_NA_LISTA = 90;
const TETO_DA_LISTA = 2000;

export const regraDaLinha = (regra: Prisma.JsonValue | null): RegraDeRecorrencia | null => (regra === null ? null : regraDeRecorrenciaSchema.parse(regra));

/**
 * Persistência das Tarefas. As ocorrências são geradas sob demanda, até o fim
 * da semana corrente, de forma idempotente (uma por tarefa e dia): a lista e a
 * criação geram o que falta, então nenhum dia se perde mesmo sem o agendador.
 */
@Injectable()
export class PrismaTarefasRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async lista(departamento: DepartamentoComTarefas, query: ListarTarefasQuery, agora: Date): Promise<{ linhas: LinhaDaOcorrencia[]; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const hoje = diaEmManaus(agora);
      await this.gerar(tx, departamento, semanaDe(hoje).fim);
      const filtros: Prisma.TarefaWhereInput[] = [{ departamento }];
      if (query.empresa) filtros.push({ empresa: { in: [query.empresa, "ambas"] } });
      if (query.responsavelId) filtros.push({ OR: [{ responsavelId: query.responsavelId }, { substitutoId: query.responsavelId }] });
      if (query.categoria) filtros.push({ categoria: { equals: query.categoria, mode: "insensitive" } });
      const desde = inicioDoDiaEmManaus(somarDias(hoje, -DIAS_DE_CONCLUIDAS_NA_LISTA));
      const linhas = await tx.ocorrenciaDeTarefa.findMany({
        where: { canceladaEm: null, tarefa: { AND: filtros }, OR: [{ concluidaEm: null }, { dia: { gte: desde } }] },
        include: INCLUDE_DA_OCORRENCIA,
        orderBy: [{ prazoEm: "asc" }, { createdAt: "asc" }],
        take: TETO_DA_LISTA,
      });
      return { linhas, pessoas: await this.nomes(tx, departamento, linhas.flatMap((l) => this.pessoasDaOcorrencia(l))) };
    });
  }

  async ocorrencia(departamento: DepartamentoComTarefas, id: string): Promise<{ linha: LinhaDaOcorrencia; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const linha = await tx.ocorrenciaDeTarefa.findFirst({ where: { id, tarefa: { departamento } }, include: INCLUDE_DA_OCORRENCIA });
      if (!linha) throw new NaoEncontrado("Tarefa não encontrada.");
      return { linha, pessoas: await this.nomes(tx, departamento, this.pessoasDaOcorrencia(linha)) };
    });
  }

  async tarefa(departamento: DepartamentoComTarefas, id: string): Promise<{ linha: LinhaDaTarefa; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const linha = await tx.tarefa.findFirst({ where: { id, departamento }, select: SELECT_DA_TAREFA });
      if (!linha) throw new NaoEncontrado("Tarefa não encontrada.");
      return { linha, pessoas: await this.nomes(tx, departamento, this.pessoasDaTarefa(linha)) };
    });
  }

  async opcoes(departamento: DepartamentoComTarefas): Promise<{ pessoas: { id: string; nome: string }[]; categorias: string[] }> {
    return this.prisma.comContexto(async (tx) => {
      const [pessoas, categorias] = await Promise.all([
        tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.pessoas_de_tarefas(${departamento}, NULL::uuid[])`,
        tx.tarefa.findMany({ where: { departamento, categoria: { not: null } }, distinct: ["categoria"], select: { categoria: true }, orderBy: { categoria: "asc" } }),
      ]);
      return { pessoas: pessoas.map((p) => ({ id: p.id, nome: p.name })), categorias: categorias.map((c) => c.categoria!) };
    });
  }

  async criar(departamento: DepartamentoComTarefas, input: CriarTarefa, principal: AuthPrincipal, agora: Date): Promise<string> {
    const dia = input.tipo === "unica" ? input.data : input.inicio;
    if (dia < diaEmManaus(agora)) {
      throw new RequisicaoInvalida("A data não pode estar no passado.", [{ campo: input.tipo === "unica" ? "data" : "inicio", problema: "Escolha hoje ou uma data futura." }]);
    }
    return this.prisma.comContexto(async (tx) => {
      await this.garantirPessoas(tx, departamento, [input.responsavelId, input.substitutoId ?? null]);
      const criada = await tx.tarefa.create({
        data: {
          departamento,
          titulo: input.titulo,
          categoria: input.categoria ?? null,
          empresa: input.empresa,
          responsavelId: input.responsavelId,
          substitutoId: input.substitutoId ?? null,
          tipo: input.tipo,
          regra: input.tipo === "recorrente" ? input.regra : Prisma.DbNull,
          dia: inicioDoDiaEmManaus(dia),
          horarioLimite: input.horarioLimite,
          exigeEvidencia: input.exigeEvidencia,
          exigeResultado: input.exigeResultado,
          instrucoes: input.instrucoes,
          atalho: input.atalho ?? null,
          criadoPorId: principal.id,
        },
        select: { id: true },
      });
      await this.gerar(tx, departamento, semanaDe(diaEmManaus(agora)).fim, criada.id);
      await this.registrar(tx, "tarefas.tarefa.created", "tarefa", criada.id, input.empresa, principal, { departamento, tipo: input.tipo });
      return criada.id;
    });
  }

  /** Encerra: a recorrente para de gerar, e as pendentes de hoje em diante saem da lista. */
  async encerrar(departamento: DepartamentoComTarefas, id: string, motivo: string, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const travada = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.tarefas WHERE id = ${id}::uuid AND departamento = ${departamento} FOR UPDATE`;
      if (travada.length === 0) throw new NaoEncontrado("Tarefa não encontrada.");
      const atual = await tx.tarefa.findUniqueOrThrow({ where: { id }, select: { encerradaEm: true, empresa: true } });
      if (atual.encerradaEm) throw new EstadoInvalido("A tarefa já foi encerrada.");
      await tx.tarefa.update({ where: { id }, data: { encerradaEm: agora, encerradaPorId: principal.id, encerramentoMotivo: motivo } });
      const canceladas = await tx.ocorrenciaDeTarefa.updateMany({
        where: { tarefaId: id, concluidaEm: null, canceladaEm: null, dia: { gte: inicioDoDiaEmManaus(diaEmManaus(agora)) } },
        data: { canceladaEm: agora },
      });
      await this.registrar(tx, "tarefas.tarefa.encerrada", "tarefa", id, atual.empresa, principal, { departamento, ocorrenciasCanceladas: canceladas.count });
    });
  }

  async travarOcorrencia(tx: Prisma.TransactionClient, departamento: DepartamentoComTarefas, id: string): Promise<LinhaDaOcorrencia> {
    const travada = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.ocorrencias_de_tarefa WHERE id = ${id}::uuid FOR UPDATE`;
    if (travada.length === 0) throw new NaoEncontrado("Tarefa não encontrada.");
    const linha = await tx.ocorrenciaDeTarefa.findFirst({ where: { id, tarefa: { departamento } }, include: INCLUDE_DA_OCORRENCIA });
    if (!linha) throw new NaoEncontrado("Tarefa não encontrada.");
    return linha;
  }

  /**
   * Conclui com o resultado, o checklist e a evidência. `conferir` recebe a
   * ocorrência travada e recusa o que não vale (permissão e o que a tarefa pede).
   */
  async concluir(
    departamento: DepartamentoComTarefas,
    id: string,
    dados: { resultado: string | null; checklist: number[] | undefined; evidencia: ArquivoGuardado | null },
    principal: AuthPrincipal,
    agora: Date,
    conferir: (linha: LinhaDaOcorrencia) => void,
  ): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const linha = await this.travarOcorrencia(tx, departamento, id);
      conferir(linha);
      // A evidência entra antes da conclusão: o RLS só aceita evidência em ocorrência aberta.
      if (dados.evidencia) {
        await tx.evidenciaDeTarefa.create({
          data: { ocorrenciaId: id, arquivoChave: dados.evidencia.chave, arquivoNome: dados.evidencia.nome, arquivoTamanho: dados.evidencia.tamanho, arquivoTipo: dados.evidencia.tipo, enviadoPorId: principal.id, enviadoEm: agora },
        });
      }
      await tx.ocorrenciaDeTarefa.update({
        where: { id },
        data: { concluidaEm: agora, concluidaPorId: principal.id, resultado: dados.resultado, checklist: marcasDoChecklist(linha.tarefa.instrucoes.length, dados.checklist) },
      });
      await this.registrar(tx, "tarefas.ocorrencia.concluida", "ocorrencia_de_tarefa", id, linha.tarefa.empresa, principal, {
        departamento, tarefaId: linha.tarefaId, comEvidencia: dados.evidencia !== null, automatica: false,
      });
    });
  }

  /**
   * Conclusão pelo sistema: quando o trabalho da tarefa automática acontece em
   * outra tela (ex.: a última plataforma do monitoramento do dia conferida). Gera
   * a ocorrência do dia se faltar; a já concluída fica como está.
   */
  async concluirAutomatica(departamento: DepartamentoComTarefas, automacao: AutomacaoDeTarefa, dia: string, principal: AuthPrincipal, agora: Date): Promise<number> {
    return this.prisma.comContexto(async (tx) => {
      await this.gerar(tx, departamento, dia);
      const pendentes = await tx.ocorrenciaDeTarefa.findMany({
        where: { dia: inicioDoDiaEmManaus(dia), concluidaEm: null, canceladaEm: null, tarefa: { departamento, automacao, encerradaEm: null } },
        select: { id: true, tarefaId: true, tarefa: { select: { empresa: true } } },
      });
      for (const o of pendentes) {
        await tx.ocorrenciaDeTarefa.update({ where: { id: o.id }, data: { concluidaEm: agora, concluidaPorId: principal.id, automatica: true } });
        await this.registrar(tx, "tarefas.ocorrencia.concluida", "ocorrencia_de_tarefa", o.id, o.tarefa.empresa, principal, { departamento, tarefaId: o.tarefaId, comEvidencia: false, automatica: true });
      }
      return pendentes.length;
    });
  }

  async evidencia(departamento: DepartamentoComTarefas, ocorrenciaId: string, evidenciaId: string): Promise<ArquivoGuardado> {
    const linha = await this.prisma.comContexto((tx) => tx.evidenciaDeTarefa.findFirst({
      where: { id: evidenciaId, ocorrenciaId, ocorrencia: { tarefa: { departamento } } },
      select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true },
    }));
    if (!linha) throw new NaoEncontrado("Evidência não encontrada.");
    return { chave: linha.arquivoChave, nome: linha.arquivoNome, tamanho: linha.arquivoTamanho, tipo: linha.arquivoTipo };
  }

  // ------------------------------------------------------------ apoio

  /**
   * Gera as ocorrências que faltam até `ate` (inclusive), uma por tarefa e dia.
   * Idempotente: duas requisições ao mesmo tempo geram uma vez só.
   */
  private async gerar(tx: Prisma.TransactionClient, departamento: DepartamentoComTarefas, ate: string, tarefaId?: string): Promise<void> {
    const limite = inicioDoDiaEmManaus(ate);
    const tarefas = await tx.tarefa.findMany({
      where: { departamento, encerradaEm: null, ...(tarefaId ? { id: tarefaId } : {}), OR: [{ geradaAte: null }, { geradaAte: { lt: limite } }] },
      select: { id: true, tipo: true, regra: true, dia: true, horarioLimite: true, geradaAte: true },
    });
    for (const t of tarefas) {
      const dias = diasParaGerar({ tipo: t.tipo, regra: regraDaLinha(t.regra), dia: diaEmManaus(t.dia), geradaAte: t.geradaAte ? diaEmManaus(t.geradaAte) : null, encerrada: false }, ate);
      if (dias.length > 0) {
        await tx.ocorrenciaDeTarefa.createMany({
          data: dias.map((dia) => ({ tarefaId: t.id, dia: inicioDoDiaEmManaus(dia), prazoEm: prazoDaOcorrencia(dia, t.horarioLimite) })),
          skipDuplicates: true,
        });
      }
      await tx.tarefa.update({ where: { id: t.id }, data: { geradaAte: limite } });
    }
  }

  private async garantirPessoas(tx: Prisma.TransactionClient, departamento: DepartamentoComTarefas, ids: (string | null)[]): Promise<void> {
    const alvos = [...new Set(ids.filter((id): id is string => id !== null))];
    const elegiveis = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.pessoas_de_tarefas(${departamento}, NULL::uuid[]) WHERE id = ANY(${alvos}::uuid[])`;
    if (elegiveis.length !== alvos.length) {
      throw new RequisicaoInvalida("Responsável e substituto precisam ser pessoas ativas do departamento.", [{ campo: "responsavelId", problema: "Escolha uma pessoa do departamento." }]);
    }
  }

  private pessoasDaTarefa(t: LinhaDaTarefa): string[] {
    return [t.responsavelId, t.substitutoId, t.criadoPorId, t.encerradaPorId].filter((id): id is string => id !== null);
  }

  private pessoasDaOcorrencia(o: LinhaDaOcorrencia): string[] {
    return [...this.pessoasDaTarefa(o.tarefa), o.concluidaPorId, ...o.evidencias.map((e) => e.enviadoPorId)].filter((id): id is string => id !== null);
  }

  private async nomes(tx: Prisma.TransactionClient, departamento: DepartamentoComTarefas, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.pessoas_de_tarefas(${departamento}, ${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: "tarefas.tarefa.created" | "tarefas.tarefa.encerrada" | "tarefas.ocorrencia.concluida",
    entityType: string,
    entityId: string,
    empresa: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      ...(empresa === "ambas" ? {} : { companyId: empresa }),
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
