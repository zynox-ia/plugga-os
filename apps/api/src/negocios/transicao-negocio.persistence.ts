import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { DealTransitionOrigin, LoseDealRequest, PipelineField } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { exigeAtribuicaoComercial, exigeOperacaoComercial, lerAcessoComercial, pessoaElegivelParaPipelines } from "../pipelines/acesso-comercial";
import { lerValores } from "../pipelines/custom-fields.rules";
import { valorNoHistorico } from "../pipelines/custom-fields.persistence";
import { podeConfigurar } from "../pipelines/pipelines.rules";
import { travarPipelines } from "../pipelines/travar-pipelines";
import { exigirAvancoSolar, garantirTarefaDoProcesso, papelNoProcesso, sincronizarResponsavelDasTarefas } from "../processo-solar/processo-solar.persistence";
import { hojeNoFuso, problemaDaPerda } from "./negocios.rules";

export type TransitionOrigin = DealTransitionOrigin | "lote" | "transferencia" | "configuracao" | "processo";
type Base = { dealId: string; pipelineId: string; version: number };
type SingleTransitionCommand = Base & (
  | { kind: "stage"; toStageId: string; beforeDealId?: string | null; origin: TransitionOrigin }
  | { kind: "transfer"; toPipelineId: string; toStageId: string; ownerId?: string; origin: "transferencia" }
  | { kind: "outcome"; outcome: "won"; origin: TransitionOrigin }
  | { kind: "outcome"; outcome: "lost"; loss: Pick<LoseDealRequest, "lossReasonId" | "revisitOn" | "note">; origin: TransitionOrigin }
  | { kind: "reallocate"; toStageId: string; toStageName: string; removedFields: readonly PipelineField[] }
);
type ConfigurationBatch = {
  kind: "reallocate_batch"; pipelineId: string; removedFields: readonly PipelineField[];
  moves: readonly { dealId: string; version: number; toStageId: string; toStageName: string }[];
};
export type TransitionCommand = SingleTransitionCommand | ConfigurationBatch;

export function validarVersaoTransicao(current: number, requested: number | undefined): void {
  if (requested !== undefined && requested !== current) throw new EstadoInvalido("Este negócio foi alterado. Recarregue os dados antes de continuar.");
}

const invalid = (message: string, campo: string) => new RequisicaoInvalida(message, [{ campo, problema: message }]);

/** Campos preservados podem tocar negócios de outros funis. A união vem antes
 * da divisão entre limpeza e realocação, sempre na mesma ordem global. */
export async function travarNegociosDaConfiguracao(
  tx: Prisma.TransactionClient, pipelineId: string, stageIds: readonly string[], removedFields: readonly PipelineField[],
): Promise<void> {
  if (!stageIds.length && !removedFields.length) return;
  const stages = stageIds.length ? Prisma.sql`pipeline_id = ${pipelineId}::uuid AND stage_id IN (${Prisma.join(stageIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.sql`false`;
  const fields = removedFields.length ? Prisma.sql`custom_fields ?| ARRAY[${Prisma.join(removedFields.map((field) => field.id))}]::text[]` : Prisma.sql`false`;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM deals WHERE (${stages}) OR (${fields}) ORDER BY id FOR UPDATE`);
}

/** Mesma ordenação de PLU-303; o chamador já mantém o lock do pipeline. */
export async function posicaoNaEtapa(tx: Prisma.TransactionClient, stageId: string, ignorarId: string | undefined, beforeDealId: string | null | undefined): Promise<Prisma.Decimal> {
  if (beforeDealId && beforeDealId === ignorarId) throw invalid("Escolha outro negócio como referência.", "beforeDealId");
  const carregar = () => tx.deal.findMany({ where: { stageId, ...(ignorarId ? { id: { not: ignorarId } } : {}) }, select: { id: true, position: true, status: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  let itens = await carregar();
  const calcular = () => {
    const indice = beforeDealId === null ? itens.length : beforeDealId === undefined ? 0 : itens.findIndex((item) => item.id === beforeDealId && item.status === "open");
    if (indice < 0) throw invalid("Escolha um negócio aberto desta etapa.", "beforeDealId");
    const anterior = itens[indice - 1]?.position;
    const proximo = itens[indice]?.position;
    if (!anterior && !proximo) return new Prisma.Decimal(1024);
    if (!anterior) return proximo!.minus(1024);
    if (!proximo) return anterior.plus(1024);
    return anterior.plus(proximo).dividedBy(2).toDecimalPlaces(10);
  };
  let position = calcular();
  const limite = new Prisma.Decimal("99999999999999999999");
  const colisao = () => itens.some((item) => item.position.equals(position)) || itens.some((item, index) => index > 0 && item.position.equals(itens[index - 1]!.position));
  if (position.abs().greaterThan(limite) || colisao()) {
    // Um único comando, na mesma ordem (posição, id) da leitura: (i + 1) × 1024.
    // Atualizar linha a linha estourava a transação em etapas com mil negócios.
    const ignorar = ignorarId ? Prisma.sql`AND id <> ${ignorarId}::uuid` : Prisma.empty;
    await tx.$executeRaw(Prisma.sql`
      UPDATE public.deals AS d SET position = ordem.n * 1024
      FROM (SELECT id, row_number() OVER (ORDER BY position ASC, id ASC) AS n FROM public.deals WHERE stage_id = ${stageId}::uuid ${ignorar}) AS ordem
      WHERE d.id = ordem.id AND d.position IS DISTINCT FROM ordem.n * 1024`);
    itens = await carregar(); position = calcular();
  }
  return position;
}

/** Entrada inicial é criação, sem uma etapa anterior ou evento artificial. */
export async function registrarEntradaInicial(
  tx: Prisma.TransactionClient, auditoria: AuditAppender, principal: AuthPrincipal, agora: Date,
  data: Prisma.DealUncheckedCreateInput, contexto: { companyId: string; pipelineName: string; stageName: string },
) {
  const actorType = principal.kind === "user" ? "user" : "agent";
  const criado = await tx.deal.create({ data: {
    ...data, stageEnteredAt: agora, createdAt: agora, updatedAt: agora,
    history: { create: { kind: "created", toStageId: data.stageId, toStageName: contexto.stageName, toPipelineName: contexto.pipelineName, actorId: principal.id, occurredAt: agora } },
  }, select: { id: true } });
  await auditoria.append(tx, {
    eventName: "commercial.deal.created", entityType: "deal", entityId: criado.id, companyId: contexto.companyId,
    actorType, actorId: principal.id, occurredAt: agora,
    payload: { companyId: contexto.companyId, pipelineId: data.pipelineId, stageId: data.stageId },
  });
  return criado;
}

/** Único escritor de etapa/desfecho. Usa a transação do chamador, sem I/O externo. */
export async function executarTransicaoNegocio(
  tx: Prisma.TransactionClient, auditoria: AuditAppender, principal: AuthPrincipal, agora: Date, command: TransitionCommand,
): Promise<void> {
  if (command.kind === "reallocate_batch") return executarRealocacaoEmLote(tx, auditoria, principal, agora, command);
  const actorType = principal.kind === "user" ? "user" : "agent";
  await travarPipelines(tx, [command.pipelineId, ...(command.kind === "transfer" ? [command.toPipelineId] : [])]);
  await tx.$queryRaw`SELECT id FROM deals WHERE id = ${command.dealId}::uuid FOR UPDATE`;
  const atual = await tx.deal.findUnique({ where: { id: command.dealId }, select: { id: true, pipelineId: true, stageId: true, version: true, status: true, ownerId: true, customFields: true } });
  if (!atual) throw new NaoEncontrado("Negócio não encontrado.");
  const acesso = await lerAcessoComercial(tx, principal.id);
  exigeOperacaoComercial(acesso);
  if (atual.pipelineId !== command.pipelineId) throw new EstadoInvalido("O negócio mudou de pipeline. Atualize a tela.");
  validarVersaoTransicao(atual.version, command.version);
  const origem = await tx.pipeline.findUnique({ where: { id: atual.pipelineId }, include: { stages: true, lossReasons: true } });
  if (!origem) throw new NaoEncontrado("Pipeline não encontrado.");
  if (command.kind === "reallocate") {
    if (!podeConfigurar(acesso, principal.id, origem)) throw new AcessoNegado("É necessário acesso de gestão do CRM para configurar pipelines.");
  } else if (atual.status !== "open") throw new EstadoInvalido("Este negócio já foi encerrado.");

  const destino = command.kind === "transfer" ? await tx.pipeline.findUnique({ where: { id: command.toPipelineId }, include: { stages: true, lossReasons: true } }) : origem;
  if (!destino) throw new NaoEncontrado("Pipeline não encontrado.");
  if (command.kind === "transfer" && destino.id === origem.id) throw invalid("Escolha outro pipeline.", "pipelineId");
  if (command.kind === "transfer" && destino.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios.");
  const etapaOrigem = origem.stages.find((stage) => stage.id === atual.stageId);
  const toStageId = command.kind === "outcome" ? atual.stageId : command.toStageId;
  const etapaDestino = destino.stages.find((stage) => stage.id === toStageId);
  if (!etapaDestino) throw invalid("Escolha uma etapa deste pipeline.", "stageId");
  const mudouEtapa = atual.stageId !== toStageId || atual.pipelineId !== destino.id;
  const data: Prisma.DealUncheckedUpdateInput = { updatedAt: agora };
  // Processo Solar ativado: qualquer entrada (quadro, ficha, lote, API, transferência)
  // cobra as mesmas pendências antes de gravar. Transferência entra pelo Atendimento.
  const alvoSolar = (command.kind === "stage" || command.kind === "transfer") && mudouEtapa ? papelNoProcesso(destino.processProfile, toStageId) : null;
  if (alvoSolar?.role) {
    const de = command.kind === "stage" ? papelNoProcesso(origem.processProfile, atual.stageId)?.role ?? null : null;
    await exigirAvancoSolar(tx, atual.id, de, alvoSolar.role);
  }

  if (command.kind === "outcome") {
    data.status = command.outcome; data.closedAt = agora;
    if (command.outcome === "lost") {
      const motivo = origem.lossReasons.find((item) => item.id === command.loss.lossReasonId) ?? null;
      const problema = problemaDaPerda(motivo, command.loss.revisitOn, hojeNoFuso(agora));
      if (problema) throw new RequisicaoInvalida("Confira o motivo da perda.", [problema]);
      data.lossReasonId = motivo!.id; data.lossReasonName = motivo!.name;
      data.lossNote = command.loss.note ?? null; data.revisitOn = command.loss.revisitOn ?? null;
    }
  } else {
    if (!mudouEtapa && (command.kind !== "stage" || command.beforeDealId === undefined)) return;
    data.stageId = toStageId;
    if (mudouEtapa && atual.status === "open") data.stageEnteredAt = agora;
    if (command.kind !== "reallocate") data.position = await posicaoNaEtapa(tx, toStageId, atual.id, command.kind === "stage" ? command.beforeDealId : undefined);
    if (command.kind === "transfer") {
      const ownerId = command.ownerId ?? atual.ownerId;
      if (ownerId !== atual.ownerId) {
        exigeAtribuicaoComercial(acesso, principal.id, ownerId);
        if (!await tx.user.findFirst({ where: { id: ownerId, ...pessoaElegivelParaPipelines }, select: { id: true } })) throw invalid("Escolha uma pessoa ativa com acesso aos pipelines do CRM.", "ownerId");
      }
      data.pipelineId = destino.id; data.ownerId = ownerId;
      await tx.dealTag.deleteMany({ where: { dealId: atual.id } });
      if (ownerId !== atual.ownerId) await sincronizarResponsavelDasTarefas(tx, principal, agora, atual.id, ownerId);
    }
  }

  const removed = command.kind === "reallocate" ? command.removedFields : [];
  const values = lerValores(atual.customFields);
  if (removed.length) {
    const next = { ...values }; for (const field of removed) delete next[field.id]; data.customFields = next;
  }
  await tx.deal.update({ where: { id: atual.id }, data });
  if (removed.length) {
    const personIds = removed.flatMap((field) => field.type === "person" && typeof values[field.id] === "string" ? [String(values[field.id])] : []);
    const people = personIds.length ? await tx.user.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(people.map((person) => [person.id, person.name]));
    const changes = removed.filter((field) => values[field.id] !== undefined && values[field.id] !== null);
    if (changes.length) await tx.dealHistory.createMany({ data: changes.map((field) => ({
      dealId: atual.id, kind: "field_changed", field: `custom:${field.name}`, beforeValue: valorNoHistorico(field, values[field.id], names) ?? Prisma.JsonNull,
      afterValue: Prisma.JsonNull, actorId: principal.id, occurredAt: agora,
    })) });
  }
  // Manutenção referencial de encerrados não é uma nova entrada comercial.
  if (command.kind === "reallocate" && atual.status !== "open") return;
  if (command.kind !== "outcome" && !mudouEtapa) return;
  const origin = command.kind === "reallocate" ? "configuracao" : command.origin;
  const history = await tx.dealHistory.create({ data: {
    dealId: atual.id, kind: command.kind === "outcome" ? command.outcome : command.kind === "transfer" ? "transferred" : "stage_changed",
    fromStageId: atual.stageId, fromStageName: etapaOrigem?.name,
    ...(command.kind === "outcome" ? {} : { toStageId, toStageName: command.kind === "reallocate" ? command.toStageName : etapaDestino.name }),
    ...(command.kind === "transfer" ? { fromPipelineName: origem.name, toPipelineName: destino.name } : {}),
    actorId: principal.id, occurredAt: agora,
  } });
  if (alvoSolar?.role && atual.status === "open") {
    await garantirTarefaDoProcesso(tx, principal, agora, { id: atual.id, ownerId: typeof data.ownerId === "string" ? data.ownerId : atual.ownerId }, alvoSolar.role, history.id);
  }
  const payload = {
    transitionId: history.id, dealId: atual.id, companyId: destino.companyId,
    fromPipelineId: origem.id, toPipelineId: destino.id, fromStageId: atual.stageId, toStageId,
    actorType, actorId: principal.id, origin, occurredAt: agora.toISOString(),
  };
  await auditoria.append(tx, {
    eventName: command.kind === "outcome" ? command.outcome === "won" ? "commercial.deal.won" : "commercial.deal.lost" : "commercial.deal.stage_changed",
    entityType: "deal", entityId: atual.id, companyId: destino.companyId, actorType, actorId: principal.id, occurredAt: agora,
    payload: { ...payload, ...(command.kind === "outcome" ? { pipelineId: origem.id, outcome: command.outcome, ...(command.outcome === "lost" ? { lossReasonId: command.loss.lossReasonId } : {}) } : {}) },
  });
  if (command.kind === "transfer") await auditoria.append(tx, {
    eventName: "commercial.deal.transferred", entityType: "deal", entityId: atual.id, companyId: destino.companyId,
    actorType, actorId: principal.id, occurredAt: agora, payload: { ...payload, fromCompanyId: origem.companyId },
  });
}

/** A manutenção compõe um lote no mesmo executor, sem repetir consultas por negócio. */
async function executarRealocacaoEmLote(
  tx: Prisma.TransactionClient, auditoria: AuditAppender, principal: AuthPrincipal, agora: Date, command: ConfigurationBatch,
): Promise<void> {
  if (!command.moves.length) return;
  const moves = new Map(command.moves.map((move) => [move.dealId, move]));
  if (moves.size !== command.moves.length) throw invalid("Negócio repetido na realocação.", "stageDestinations");
  await travarPipelines(tx, [command.pipelineId]);
  // A configuração já bloqueou a união de realocados e valores preservados
  // antes de dividir suas escritas; repetir o lock reavaliaria a RLS por linha.
  const acesso = await lerAcessoComercial(tx, principal.id);
  exigeOperacaoComercial(acesso);
  const origem = await tx.pipeline.findUnique({ where: { id: command.pipelineId }, include: { stages: true } });
  if (!origem) throw new NaoEncontrado("Pipeline não encontrado.");
  if (!podeConfigurar(acesso, principal.id, origem)) throw new AcessoNegado("É necessário acesso de gestão do CRM para configurar pipelines.");
  const rows = await tx.deal.findMany({ where: { id: { in: [...moves.keys()] } }, select: { id: true, pipelineId: true, stageId: true, version: true, status: true, customFields: true }, orderBy: { id: "asc" } });
  if (rows.length !== moves.size) throw new NaoEncontrado("Negócio não encontrado.");
  for (const row of rows) {
    const move = moves.get(row.id)!;
    if (row.pipelineId !== command.pipelineId) throw new EstadoInvalido("O negócio mudou de pipeline. Atualize a tela.");
    validarVersaoTransicao(row.version, move.version);
    if (!origem.stages.some((stage) => stage.id === move.toStageId)) throw invalid("Escolha uma etapa deste pipeline.", "stageId");
  }
  const affected = rows.filter((row) => row.stageId !== moves.get(row.id)!.toStageId);
  if (!affected.length) return;
  const fields = command.removedFields;
  const values = new Map(affected.map((row) => [row.id, lerValores(row.customFields)]));
  const personIds = new Set(affected.flatMap((row) => fields.flatMap((field) => field.type === "person" && typeof values.get(row.id)![field.id] === "string" ? [String(values.get(row.id)![field.id])] : [])));
  const people = personIds.size ? await tx.user.findMany({ where: { id: { in: [...personIds] } }, select: { id: true, name: true } }) : [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  const history: Prisma.DealHistoryCreateManyInput[] = affected.flatMap((row) => fields.filter((field) => values.get(row.id)![field.id] !== undefined && values.get(row.id)![field.id] !== null).map((field) => ({
    dealId: row.id, kind: "field_changed", field: `custom:${field.name}`, beforeValue: valorNoHistorico(field, values.get(row.id)![field.id], names) ?? Prisma.JsonNull,
    afterValue: Prisma.JsonNull, actorId: principal.id, occurredAt: agora,
  })));
  const stages = new Map(origem.stages.map((stage) => [stage.id, stage]));
  const stageHistory = affected.filter((row) => row.status === "open").map((row) => ({
    id: randomUUID(), dealId: row.id, kind: "stage_changed" as const, fromStageId: row.stageId, fromStageName: stages.get(row.stageId)?.name,
    toStageId: moves.get(row.id)!.toStageId, toStageName: moves.get(row.id)!.toStageName, actorId: principal.id, occurredAt: agora,
  }));
  const updateRows = affected.map((row) => ({ id: row.id, stage_id: moves.get(row.id)!.toStageId, version: row.version }));
  const customFields = fields.length ? Prisma.sql`d.custom_fields - ARRAY[${Prisma.join(fields.map((field) => field.id))}]::text[]` : Prisma.sql`d.custom_fields`;
  const updated = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE public.deals AS d SET stage_id = target.stage_id,
      stage_entered_at = CASE WHEN d.status = 'open' THEN ${agora} ELSE d.stage_entered_at END,
      custom_fields = ${customFields}, updated_at = ${agora}
    FROM jsonb_to_recordset(${JSON.stringify(updateRows)}::jsonb) AS target(id uuid, stage_id uuid, version integer)
    WHERE d.id = target.id AND d.pipeline_id = ${command.pipelineId}::uuid AND d.version = target.version
    RETURNING d.id`);
  if (updated.length !== affected.length) throw new EstadoInvalido("Este negócio foi alterado. Recarregue os dados antes de continuar.");
  if (history.length || stageHistory.length) await tx.dealHistory.createMany({ data: [...history, ...stageHistory] });
  const actorType = principal.kind === "user" ? "user" : "agent";
  await auditoria.appendMany(tx, stageHistory.map((entry) => ({
    eventName: "commercial.deal.stage_changed", entityType: "deal", entityId: entry.dealId, companyId: origem.companyId, actorType, actorId: principal.id, occurredAt: agora,
    payload: { transitionId: entry.id, dealId: entry.dealId, companyId: origem.companyId, fromPipelineId: origem.id, toPipelineId: origem.id,
      fromStageId: entry.fromStageId, toStageId: entry.toStageId, actorType, actorId: principal.id, origin: "configuracao", occurredAt: agora.toISOString() },
  })));
}
