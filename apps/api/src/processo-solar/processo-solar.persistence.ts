import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  leadSolarProjectSchema, SOLAR_PROCESS_TASKS,
  type SolarPendency, type SolarProcessActivation, type SolarStageRole, type SolarTaskRole,
} from "@plugga/shared";

import { registrarMudancaDeAtividade } from "../atividades/atividades.persistence";
import { calcularPrazoManaus } from "../atividades/calendario-manaus";
import { RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { lerPerfilDeProcesso } from "../pipelines/solar-profile.rules";
import { papelDaEtapa, pendenciasDoAvanco, type ContextoSolar } from "./processo-solar.rules";

type Tx = Prisma.TransactionClient;

/** Só pipelines com o processo ativado aplicam tarefas e bloqueios Solar. */
export function ativacaoSolar(profile: unknown): SolarProcessActivation | null {
  return lerPerfilDeProcesso(profile)?.activation ?? null;
}

export function papelNoProcesso(profile: unknown, stageId: string): { activation: SolarProcessActivation; role: SolarStageRole | null } | null {
  const activation = ativacaoSolar(profile);
  return activation ? { activation, role: papelDaEtapa(activation, stageId) } : null;
}

export async function carregarContextoSolar(tx: Tx, dealId: string): Promise<ContextoSolar> {
  const deal = await tx.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      clientId: true, solarProjects: true,
      profile: { select: { name: true, phone: true, email: true } },
      leadContact: { select: { phone: true, email: true } },
    },
  });
  const projetos = Array.isArray(deal.solarProjects) ? deal.solarProjects.map((item) => leadSolarProjectSchema.parse(item)) : [];
  const contas = projetos.flatMap((project) => project.energyBillDocumentIds);
  const disponiveis = contas.length ? new Set((await tx.leadDocument.findMany({
    where: { id: { in: contas }, dealId, category: "conta_de_energia", uploadState: "ready", archivedAt: null }, select: { id: true },
  })).map((doc) => doc.id)) : new Set<string>();
  const preenchido = (value: string | null | undefined) => !!value?.trim();
  return {
    vinculo: {
      nome: preenchido(deal.profile?.name),
      contato: [deal.profile?.phone, deal.profile?.email, deal.leadContact?.phone, deal.leadContact?.email].some(preenchido),
      cliente: deal.clientId !== null,
    },
    projetos: projetos.map((project) => ({ ...project, energyBillDocumentIds: project.energyBillDocumentIds.filter((id) => disponiveis.has(id)) })),
  };
}

/** Só a mensagem: a tela mostra o texto inteiro, em vez de destacar campos de outro formulário. */
export function erroDePendencias(pendencies: SolarPendency[]): RequisicaoInvalida {
  return new RequisicaoInvalida(`Pendências do processo Solar: ${pendencies.map((item) => item.message).join(" ")}`);
}

/** Lança com as pendências quando o avanço não cumpre as saídas das etapas percorridas. */
export async function exigirAvancoSolar(tx: Tx, dealId: string, from: SolarStageRole | null, to: SolarStageRole): Promise<void> {
  const pendencies = pendenciasDoAvanco(from, to, await carregarContextoSolar(tx, dealId));
  if (pendencies.length) throw erroDePendencias(pendencies);
}

/**
 * Uma tarefa por negócio/etapa. Entrar de novo numa etapa com a tarefa encerrada
 * abre outra rodada com novo prazo, preservando as anteriores; tarefa aberta
 * não é duplicada nem tem o prazo alterado.
 */
export async function garantirTarefaDoProcesso(
  tx: Tx, principal: AuthPrincipal, agora: Date, deal: { id: string; ownerId: string }, role: SolarStageRole, transitionId: string | null,
): Promise<void> {
  if (!(role in SOLAR_PROCESS_TASKS)) return;
  const rule = SOLAR_PROCESS_TASKS[role as SolarTaskRole];
  const actorType = principal.kind === "user" ? "user" : "agent";
  const round = {
    ownerId: deal.ownerId, startsAt: agora, dueAt: calcularPrazoManaus(agora, rule.businessDays),
    openedAt: agora, openedByType: actorType, openedById: principal.id, sourceTransitionId: transitionId,
  };
  const existing = await tx.activity.findFirst({
    where: { dealId: deal.id, ruleKey: rule.ruleKey },
    include: { rounds: { orderBy: { number: "desc" }, take: 1 } },
  });
  if (!existing) {
    // A unicidade vem de (deal_id, rule_key); a chave de criação é derivada do mesmo par.
    const hash = createHash("sha256").update(`${deal.id}:${rule.ruleKey}`).digest("hex");
    const created = await tx.activity.create({ data: {
      dealId: deal.id, type: "task", title: rule.title, origin: "process", ruleKey: rule.ruleKey,
      createdByType: actorType, createdById: principal.id,
      creationRequestId: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
      creationHash: hash,
      createdAt: agora, rounds: { create: { number: 1, ...round } },
    } });
    await registrarMudancaDeAtividade(tx, created.id, "created", principal, agora);
    return;
  }
  const current = existing.rounds[0]!;
  if (current.endedAt === null) return;
  await tx.activityRound.create({ data: { activityId: existing.id, number: current.number + 1, ...round } });
  await tx.activity.update({ where: { id: existing.id }, data: { currentRoundNumber: current.number + 1 } });
  await registrarMudancaDeAtividade(tx, existing.id, "reopened", principal, agora);
}

/** O responsável das tarefas do processo acompanha o responsável atual do card. */
export async function sincronizarResponsavelDasTarefas(tx: Tx, principal: AuthPrincipal, agora: Date, dealId: string, ownerId: string): Promise<void> {
  const abertas = await tx.activityRound.findMany({
    where: { endedAt: null, ownerId: { not: ownerId }, activity: { dealId, origin: "process" } },
    select: { id: true, activityId: true },
  });
  for (const round of abertas) {
    await tx.activityRound.update({ where: { id: round.id }, data: { ownerId } });
    await tx.$executeRaw`UPDATE public.activities SET title = title WHERE id = ${round.activityId}::uuid`;
    await registrarMudancaDeAtividade(tx, round.activityId, "updated", principal, agora);
  }
}
