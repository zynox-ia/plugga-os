import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  activityHistoryResponseSchema, alcancaTela, completeActivityResponseSchema, listActivitiesResponseSchema,
  type Activity, type ActivityTarget, type CompleteActivityRequest, type CompleteActivityResponse,
  type CreateActivityRequest, type ListActivitiesQuery, type ListActivityHistoryQuery, type UpdateActivityRequest,
} from "@plugga/shared";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { exigeAtribuicaoPermitida, gerenciaRegistros } from "../core/auth/escopo-registros";
import { mapAcesso } from "../core/auth/user-access.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { AuditAppender } from "../audit/audit-appender";
import { aoConcluirTarefaDoProcesso } from "../processo-solar/automacoes-solar";
import { travarPipelines } from "../pipelines/travar-pipelines";
import { AtividadesRepository } from "./atividades.repository";
import { exigeRodadaAberta, janelaManaus, validarAgenda } from "./atividades.rules";
import { actor, INCLUDE_ATIVIDADE, registrarMudancaDeAtividade, target, view, type Row } from "./atividades.persistence";

const notFound = () => new NaoEncontrado("Atividade não encontrada.");
const screen = (value: ActivityTarget) => value.kind === "deal" ? "crm.pipelines" as const : "crm.clientes" as const;

@Injectable()
export class PrismaAtividadesRepository extends AtividadesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender = new AuditAppender(),
  ) { super(); }

  async create(input: CreateActivityRequest, principal: AuthPrincipal): Promise<Activity> {
    return this.prisma.comContexto(async (tx) => {
      const current = await this.principal(tx, principal);
      return this.createWithin(tx, input, current, new Date());
    });
  }

  async get(id: string, principal: AuthPrincipal): Promise<Activity> {
    return this.prisma.comContexto(async (tx) => {
      const current = await this.principal(tx, principal);
      const row = await tx.activity.findUnique({ where: { id }, include: INCLUDE_ATIVIDADE });
      if (!row) throw notFound();
      await this.authorizeTarget(tx, target(row), current);
      return view(row);
    });
  }

  async list(query: ListActivitiesQuery, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
      const current = await this.principal(tx, principal);
      const requestedTarget: ActivityTarget | null = query.dealId ? { kind: "deal", dealId: query.dealId } : query.clientId ? { kind: "client", clientId: query.clientId } : null;
      if (requestedTarget) await this.authorizeTarget(tx, requestedTarget, current);
      if (query.scope === "team" && !gerenciaRegistros(current, "crm", requestedTarget ? [screen(requestedTarget)] : ["crm.pipelines", "crm.clientes"])) {
        throw new AcessoNegado("Somente a gestão pode consultar atividades da equipe.");
      }
      const allowed = [
        ...(alcancaTela(current.acesso, "crm.pipelines") ? [Prisma.sql`a.deal_id IS NOT NULL`] : []),
        ...(alcancaTela(current.acesso, "crm.clientes") ? [Prisma.sql`a.client_id IS NOT NULL`] : []),
      ];
      if (!allowed.length) throw notFound();
      const filters = [Prisma.sql`(${Prisma.join(allowed, " OR ")})`];
      if (query.dealId) filters.push(Prisma.sql`a.deal_id = ${query.dealId}::uuid`);
      if (query.clientId) filters.push(Prisma.sql`a.client_id = ${query.clientId}::uuid`);
      if (query.scope === "mine") filters.push(Prisma.sql`r.owner_id = ${current.id}::uuid`);
      if (query.cursor) filters.push(Prisma.sql`a.id > ${query.cursor}::uuid`);
      const now = new Date(); const range = janelaManaus(now);
      if (query.bucket === "completed") filters.push(Prisma.sql`r.status = 'done'`);
      else if (query.bucket !== "all") {
        filters.push(Prisma.sql`r.ended_at IS NULL`);
        if (query.bucket === "overdue") filters.push(Prisma.sql`r.due_at < ${now}`);
        if (query.bucket === "today") filters.push(Prisma.sql`r.due_at >= ${range.today} AND r.due_at < ${range.tomorrow}`);
        if (query.bucket === "next7") filters.push(Prisma.sql`r.due_at >= ${range.tomorrow} AND r.due_at < ${range.afterNext7}`);
      }
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT a.id FROM public.activities a JOIN public.activity_rounds r ON r.activity_id = a.id AND r.number = a.current_round_number
        WHERE ${Prisma.join(filters, " AND ")} ORDER BY a.id ASC LIMIT ${query.limit + 1}`);
      const page = ids.slice(0, query.limit);
      const rows = await tx.activity.findMany({ where: { id: { in: page.map((row) => row.id) } }, orderBy: { id: "asc" }, include: INCLUDE_ATIVIDADE });
      return listActivitiesResponseSchema.parse({ activities: rows.map(view), nextCursor: ids.length > query.limit ? page.at(-1)!.id : null });
    });
  }

  async update(id: string, input: UpdateActivityRequest, principal: AuthPrincipal): Promise<Activity> {
    return this.prisma.comContexto(async (tx) => {
      const current = await this.principal(tx, principal);
      const row = await this.lock(tx, id, current); const round = row.rounds[0]!;
      exigeRodadaAberta(row.version, input.version, round.endedAt);
      if (row.origin === "process" && [input.ownerId, input.startsAt, input.dueAt].some((value) => value !== undefined)) {
        throw new RequisicaoInvalida("Responsável e prazo desta atividade são definidos pelo processo.");
      }
      const startsAt = input.startsAt === undefined ? round.startsAt : new Date(input.startsAt);
      const dueAt = input.dueAt === undefined ? round.dueAt : new Date(input.dueAt);
      validarAgenda(startsAt, dueAt);
      if (input.ownerId !== undefined && input.ownerId !== round.ownerId) await this.authorizeOwner(tx, input.ownerId, target(row), current);
      await this.cas(tx, id, input.version, { title: input.title, notes: input.notes, priority: input.priority });
      await tx.activityRound.update({ where: { id: round.id }, data: { startsAt, dueAt, status: input.status, ownerId: input.ownerId } });
      return this.record(tx, id, "updated", current, new Date());
    });
  }

  async complete(id: string, input: CompleteActivityRequest, principal: AuthPrincipal): Promise<CompleteActivityResponse> {
    return this.prisma.comContexto(async (tx) => {
      const current = await this.principal(tx, principal);
      // Tarefa do processo pode mover o card: trava o pipeline antes do negócio,
      // na mesma ordem do executor de transições, para não haver deadlock.
      const previa = await tx.activity.findUnique({ where: { id }, select: { origin: true, deal: { select: { pipelineId: true } } } });
      if (previa?.origin === "process" && previa.deal) await travarPipelines(tx, [previa.deal.pipelineId]);
      const row = await this.lock(tx, id, current); const round = row.rounds[0]!;
      exigeRodadaAberta(row.version, input.version, round.endedAt);
      if (round.id !== input.roundId) throw new EstadoInvalido("A rodada da atividade mudou. Recarregue.");
      if (!input.outcome.summary.trim()) throw new RequisicaoInvalida("Registre o resultado da atividade.");
      await this.validateEvidence(tx, row, input.outcome.documentIds);
      const now = new Date();
      const nextActivity = input.nextAction ? await this.createWithin(tx, {
        ...input.nextAction, requestId: randomUUID(), target: target(row),
      }, current, now) : null;
      await this.cas(tx, id, input.version, {});
      // Inserir antes de encerrar: RLS recusa anexar evidência a rodada já fechada.
      if (input.outcome.documentIds.length) await tx.activityRoundEvidence.createMany({ data: input.outcome.documentIds.map((leadDocumentId) => ({ roundId: round.id, leadDocumentId })) });
      await tx.activityRound.update({ where: { id: round.id }, data: {
        status: "done", endedAt: now, endReason: "completed", completedAt: now,
        completedByType: actor(current).type, completedById: current.id, outcomeSummary: input.outcome.summary.trim(), nextActivityId: nextActivity?.id ?? null,
      } });
      const activity = await this.record(tx, id, "completed", current, now);
      // Tarefa do processo Solar: a conclusão do Atendimento avança o card na mesma transação.
      if (row.origin === "process") await aoConcluirTarefaDoProcesso(tx, this.auditoria, current, now, row);
      return completeActivityResponseSchema.parse({ activity, nextActivity });
    });
  }

  async history(id: string, query: ListActivityHistoryQuery, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
      const current = await this.principal(tx, principal);
      const row = await tx.activity.findUnique({ where: { id } });
      if (!row) throw notFound();
      await this.authorizeTarget(tx, target(row), current);
      const cursor = query.cursor ? await tx.activityChange.findFirst({ where: { id: query.cursor, activityId: id } }) : null;
      if (query.cursor && !cursor) throw new RequisicaoInvalida("Cursor de histórico inválido.");
      const rows = await tx.activityChange.findMany({ where: { activityId: id, version: { gt: cursor?.version ?? 0 } }, orderBy: { version: "asc" }, take: query.limit + 1 });
      const page = rows.slice(0, query.limit);
      return activityHistoryResponseSchema.parse({ entries: page.map((entry) => ({
        id: entry.id, kind: entry.kind, occurredAt: entry.occurredAt.toISOString(), actor: { type: entry.actorType, id: entry.actorId }, snapshot: entry.snapshot,
      })), nextCursor: rows.length > query.limit ? page.at(-1)!.id : null });
    });
  }

  private async principal(tx: Prisma.TransactionClient, principal: AuthPrincipal): Promise<AuthPrincipal> {
    const user = await tx.user.findUnique({ where: { id: principal.id }, select: { status: true, platformRoles: { include: { role: true } }, departamentos: true } });
    if (!user || user.status !== "active") throw notFound();
    return { ...principal, acesso: mapAcesso(user) };
  }

  private async authorizeTarget(tx: Prisma.TransactionClient, value: ActivityTarget, principal: AuthPrincipal, lock = false): Promise<void> {
    if (!alcancaTela(principal.acesso, screen(value))) throw notFound();
    const rows = value.kind === "deal"
      ? await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM public.deals WHERE id = ${value.dealId}::uuid ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`)
      : await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM public.clients WHERE id = ${value.clientId}::uuid ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
    if (!rows.length) throw notFound();
  }

  private async authorizeOwner(tx: Prisma.TransactionClient, ownerId: string, value: ActivityTarget, principal: AuthPrincipal): Promise<void> {
    const tela = screen(value);
    exigeAtribuicaoPermitida(principal, ownerId, "crm", [tela]);
    const owner = await tx.user.findFirst({ where: { id: ownerId, status: "active", OR: [
      { platformRoles: { some: { role: { key: { in: ["admin", "desenvolvedor"] } } } } },
      { departamentos: { some: { departamento: "crm", telas: { has: tela } } } },
    ] }, select: { id: true } });
    if (!owner) throw new RequisicaoInvalida("Escolha uma pessoa ativa com acesso à tela do alvo.", [{ campo: "ownerId", problema: "responsável inelegível" }]);
  }

  private async lock(tx: Prisma.TransactionClient, id: string, principal: AuthPrincipal): Promise<Row> {
    const initial = await tx.activity.findUnique({ where: { id } });
    if (!initial) throw notFound();
    await this.authorizeTarget(tx, target(initial), principal, true);
    await tx.$queryRaw`SELECT id FROM public.activities WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.activity.findUnique({ where: { id }, include: INCLUDE_ATIVIDADE });
    if (!row) throw notFound();
    return row;
  }

  private async cas(tx: Prisma.TransactionClient, id: string, version: number, data: Prisma.ActivityUpdateManyMutationInput): Promise<void> {
    const changed = await tx.activity.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new EstadoInvalido("A atividade mudou. Recarregue antes de continuar.");
  }

  private async createWithin(tx: Prisma.TransactionClient, input: CreateActivityRequest, principal: AuthPrincipal, now: Date): Promise<Activity> {
    await this.authorizeTarget(tx, input.target, principal, true);
    const who = actor(principal);
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    // Serializa uma intenção sem depender de TTL nem abortar o tx com P2002.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${who.type}:${principal.id}:${input.requestId}`}, 0))`;
    const existing = await tx.activity.findUnique({ where: { createdByType_createdById_creationRequestId: { createdByType: who.type, createdById: principal.id, creationRequestId: input.requestId } }, include: INCLUDE_ATIVIDADE });
    if (existing) {
      if (existing.creationHash !== hash) throw new EstadoInvalido("A chave desta criação já foi usada com outros dados.");
      return view(existing);
    }
    await this.authorizeOwner(tx, input.ownerId, input.target, principal);
    validarAgenda(new Date(input.startsAt), new Date(input.dueAt));
    const created = await tx.activity.create({ data: {
      dealId: input.target.kind === "deal" ? input.target.dealId : null, clientId: input.target.kind === "client" ? input.target.clientId : null,
      type: input.type, title: input.title, notes: input.notes, priority: input.priority,
      createdByType: who.type, createdById: principal.id, creationRequestId: input.requestId, creationHash: hash, createdAt: now,
      rounds: { create: { number: 1, ownerId: input.ownerId, startsAt: new Date(input.startsAt), dueAt: new Date(input.dueAt), openedAt: now, openedByType: who.type, openedById: principal.id } },
    } });
    return this.record(tx, created.id, "created", principal, now);
  }

  private async validateEvidence(tx: Prisma.TransactionClient, row: Row, ids: string[]): Promise<void> {
    if (!ids.length) return;
    if (!row.dealId || new Set(ids).size !== ids.length) throw new RequisicaoInvalida("Use documentos do próprio negócio.");
    const documents = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM public.lead_documents WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND deal_id = ${row.dealId}::uuid AND upload_state = 'ready' AND archived_at IS NULL FOR SHARE`);
    if (documents.length !== ids.length) throw new RequisicaoInvalida("Use documentos disponíveis do próprio negócio.", [{ campo: "outcome.documentIds", problema: "documento inválido ou indisponível" }]);
  }

  private record(tx: Prisma.TransactionClient, id: string, kind: "created" | "updated" | "completed", principal: AuthPrincipal, now: Date): Promise<Activity> {
    return registrarMudancaDeAtividade(tx, id, kind, principal, now);
  }
}

