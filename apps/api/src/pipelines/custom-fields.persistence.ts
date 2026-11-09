import { Prisma } from "@prisma/client";
import type { CustomFieldValues, DealHistoryValue, PipelineField } from "@plugga/shared";

import { pessoaElegivelParaPipelines } from "./acesso-comercial";
import { lerValores, validarValores, type ContagensDeCampos } from "./custom-fields.rules";

/** Uma consulta para todos os campos/listagem, incluindo negócios transferidos. */
export async function contarValores(tx: Prisma.TransactionClient, fields: readonly PipelineField[]): Promise<ContagensDeCampos> {
  if (fields.length === 0) return {};
  const ids = fields.map((field) => field.id);
  const selections = fields.filter((field) => field.type === "select").map((field) => field.id);
  // Só seleção exige contagem por valor (IDs de opção); texto/pessoa nunca
  // saem desta agregação, e cada outro campo devolve apenas uma contagem.
  const option = selections.length ? Prisma.sql`CASE WHEN entry.key IN (${Prisma.join(selections)}) THEN entry.value #>> '{}' ELSE NULL END` : Prisma.sql`NULL::text`;
  const rows = await tx.$queryRaw<{ id: string; value: string | null; count: number }[]>(Prisma.sql`
    SELECT entry.key AS id, ${option} AS value, count(*)::int AS count
    FROM deals d CROSS JOIN LATERAL jsonb_each(d.custom_fields) entry
    WHERE d.custom_fields ?| ARRAY[${Prisma.join(ids)}]::text[]
      AND entry.key IN (${Prisma.join(ids)}) AND entry.value NOT IN ('null'::jsonb, '""'::jsonb)
    GROUP BY entry.key, 2`);
  const counts: ContagensDeCampos = {};
  for (const row of rows) {
    const count = counts[row.id] ??= { count: 0, options: {} };
    count.count += row.count;
    if (row.value !== null) count.options[row.value] = row.count;
  }
  return counts;
}

export function valorNoHistorico(field: PipelineField, value: string | boolean | null | undefined, people: ReadonlyMap<string, string>): DealHistoryValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && (field.type === "select" || field.type === "person")) {
    return { id: value, name: field.type === "select" ? field.options.find((option) => option.id === value)?.name ?? value : people.get(value) ?? value };
  }
  return value;
}

export async function prepararValores(tx: Prisma.TransactionClient, fields: readonly PipelineField[], input: CustomFieldValues, before: CustomFieldValues = {}) {
  input = Object.fromEntries(Object.entries(input).map(([id, value]) => [id.toLowerCase(), value]));
  const personFields = fields.filter((field) => field.type === "person");
  const afterIds = personFields.flatMap((field) => typeof input[field.id] === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(input[field.id])) ? [String(input[field.id]).toLowerCase()] : []);
  const eligible = afterIds.length ? await tx.user.findMany({ where: { id: { in: afterIds }, ...pessoaElegivelParaPipelines }, select: { id: true, name: true } }) : [];
  const values = validarValores(fields, input, eligible.map((person) => person.id));
  const beforeIds = personFields.flatMap((field) => typeof before[field.id] === "string" ? [String(before[field.id])] : []);
  const previous = beforeIds.length ? await tx.user.findMany({ where: { id: { in: beforeIds } }, select: { id: true, name: true } }) : [];
  const people = new Map([...previous, ...eligible].map((person) => [person.id, person.name]));
  const changes = fields.flatMap((field) => {
    if (!Object.hasOwn(values, field.id) || (before[field.id] ?? null) === values[field.id]) return [];
    return [{ field: `custom:${field.name}`, fieldId: field.id, before: valorNoHistorico(field, before[field.id], people), after: valorNoHistorico(field, values[field.id], people) }];
  });
  return { values, changes };
}

/** Confirmação de remoção apaga inclusive os valores preservados na origem. */
export async function removerValores(
  tx: Prisma.TransactionClient, fields: readonly PipelineField[], actorId: string,
  stageMoves: readonly { fromId: string; fromName: string; toId: string; toName: string }[] = [],
): Promise<void> {
  if (!fields.length) return;
  const ids = fields.map((field) => field.id);
  // Ordem fixa de locks também protege edições de campos do pipeline destino.
  const deals = await tx.$queryRaw<{ id: string; custom_fields: Prisma.JsonValue; stage_id: string; status: string }[]>(Prisma.sql`
    SELECT id, custom_fields, stage_id, status FROM deals WHERE custom_fields ?| ARRAY[${Prisma.join(ids)}]::text[] ORDER BY id FOR UPDATE`);
  const personIds = new Set(deals.flatMap((deal) => {
    const values = lerValores(deal.custom_fields);
    return fields.flatMap((field) => field.type === "person" && typeof values[field.id] === "string" ? [String(values[field.id])] : []);
  }));
  const people = personIds.size ? await tx.user.findMany({ where: { id: { in: [...personIds] } }, select: { id: true, name: true } }) : [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  for (const deal of deals) {
    const values = lerValores(deal.custom_fields);
    const changes = fields.filter((field) => values[field.id] !== undefined && values[field.id] !== null);
    for (const id of ids) delete values[id];
    const move = stageMoves.find((stage) => stage.fromId === deal.stage_id);
    const now = new Date();
    // A mesma configuração pode excluir etapa e campo. Mova já esta linha:
    // o fluxo de etapas depois só encontra as restantes, sem version +2.
    await tx.deal.update({ where: { id: deal.id }, data: {
      customFields: values,
      ...(move ? { stageId: move.toId, ...(deal.status === "open" ? { stageEnteredAt: now } : {}) } : {}),
    } });
    if (move && deal.status === "open") await tx.dealHistory.create({ data: {
      dealId: deal.id, kind: "stage_changed", fromStageId: move.fromId, fromStageName: move.fromName,
      toStageId: move.toId, toStageName: move.toName, actorId, occurredAt: now,
    } });
    if (changes.length) await tx.dealHistory.createMany({ data: changes.map((field) => ({
      dealId: deal.id, kind: "field_changed", field: `custom:${field.name}`,
      beforeValue: valorNoHistorico(field, lerValores(deal.custom_fields)[field.id], names) ?? Prisma.JsonNull,
      afterValue: Prisma.JsonNull, actorId,
    })) });
  }
}
