import { Prisma } from "@prisma/client";
import { activitySchema, type Activity, type ActivityActor, type ActivityTarget } from "@plugga/shared";
import type { AuthPrincipal } from "../core/auth/auth.types";

export const INCLUDE_ATIVIDADE = { rounds: { orderBy: { number: "desc" }, take: 1, include: { evidence: true } } } satisfies Prisma.ActivityInclude;
export type Row = Prisma.ActivityGetPayload<{ include: typeof INCLUDE_ATIVIDADE }>;
export const actor = (p: AuthPrincipal): ActivityActor => ({ type: p.kind === "user" ? "user" : "agent", id: p.id });
export const target = (row: { dealId: string | null; clientId: string | null }): ActivityTarget => row.dealId
  ? { kind: "deal", dealId: row.dealId } : { kind: "client", clientId: row.clientId! };

export function view(row: Row): Activity {
  const round = row.rounds[0];
  if (!round || round.number !== row.currentRoundNumber) throw new Error("Rodada vigente ausente.");
  return activitySchema.parse({
    id: row.id, version: row.version, target: target(row), type: row.type, title: row.title, notes: row.notes, priority: row.priority,
    origin: row.origin, ruleKey: row.ruleKey, createdAt: row.createdAt.toISOString(), createdBy: { type: row.createdByType, id: row.createdById },
    currentRound: {
      id: round.id, number: round.number, status: round.status, ownerId: round.ownerId,
      startsAt: round.startsAt.toISOString(), dueAt: round.dueAt.toISOString(), openedAt: round.openedAt.toISOString(),
      openedBy: { type: round.openedByType, id: round.openedById }, endedAt: round.endedAt?.toISOString() ?? null, endReason: round.endReason,
      completedAt: round.completedAt?.toISOString() ?? null, completedBy: round.completedById ? { type: round.completedByType, id: round.completedById } : null,
      outcome: round.outcomeSummary === null ? null : { summary: round.outcomeSummary, documentIds: round.evidence.map((item) => item.leadDocumentId).sort() },
      nextActivityId: round.nextActivityId,
    },
  });
}

/** Histórico imutável por versão; usado também pelas tarefas do processo Solar. */
export async function registrarMudancaDeAtividade(
  tx: Prisma.TransactionClient, id: string, kind: "created" | "updated" | "completed" | "reopened", principal: AuthPrincipal, now: Date,
): Promise<Activity> {
  const result = view(await tx.activity.findUniqueOrThrow({ where: { id }, include: INCLUDE_ATIVIDADE }));
  await tx.activityChange.create({ data: { activityId: id, version: result.version, kind, actorType: actor(principal).type, actorId: principal.id, occurredAt: now, snapshot: result } });
  return result;
}
