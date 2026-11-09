import { randomUUID } from "node:crypto";

import { z } from "zod";
import { pipelineFieldSchema, type CustomFieldValues, type PipelineField, type PipelineFieldInput } from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";

export type ContagensDeCampos = Record<string, { count: number; options: Record<string, number> }>;
export const lerCampos = (value: unknown): PipelineField[] => z.array(pipelineFieldSchema).parse(value ?? []);
// O armazenamento inclui campos preservados de outros pipelines, sem o limite
// de 40 aplicado à edição/resposta de um único pipeline.
export const lerValores = (value: unknown): CustomFieldValues => z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])).parse(value ?? {});
const invalido = (message: string, id?: string) => new RequisicaoInvalida(message, [{ campo: id ? `customFields.${id}` : "fields", problema: message }]);

export function configurarCampos(
  current: readonly PipelineField[], input: readonly PipelineFieldInput[], confirmed: readonly string[], counts: ContagensDeCampos,
): PipelineField[] {
  for (const field of current) {
    if (!input.some((item) => item.id?.toLowerCase() === field.id) && (counts[field.id]?.count ?? 0) > 0 && !confirmed.includes(field.id)) {
      throw invalido(`Confirme a exclusão de "${field.name}": ${counts[field.id]!.count} negócio(s) com valor, incluindo transferidos.`);
    }
  }
  return input.map((field, position) => {
    const existing = field.id ? current.find((item) => item.id === field.id?.toLowerCase()) : undefined;
    if (field.id && !existing) throw invalido("Campo não pertence a este pipeline.");
    if (existing && existing.type !== field.type && (counts[existing.id]?.count ?? 0) > 0) throw invalido(`O campo "${existing.name}" tem valores. Limpe-os antes de trocar o tipo.`);
    const options = (field.options ?? []).map((option) => {
      const previous = option.id ? existing?.options.find((item) => item.id === option.id?.toLowerCase()) : undefined;
      if (option.id && !previous) throw invalido("A opção não pertence a este campo do pipeline.");
      return { id: previous?.id ?? randomUUID(), name: option.name };
    });
    for (const option of existing?.options ?? []) {
      if (!options.some((item) => item.id === option.id) && (counts[existing!.id]?.options[option.id] ?? 0) > 0) throw invalido(`A opção "${option.name}" está em uso. Limpe os valores antes de removê-la.`);
    }
    return { id: existing?.id ?? randomUUID(), name: field.name, type: field.type, options, position, valueCount: 0, showOnCard: field.showOnCard, showInList: field.showInList };
  });
}

export function validarValores(fields: readonly PipelineField[], values: CustomFieldValues, people: readonly string[]): CustomFieldValues {
  const result: CustomFieldValues = {};
  for (const [key, value] of Object.entries(values)) {
    const id = key.toLowerCase();
    const field = fields.find((item) => item.id === id);
    if (!field) throw invalido("Campo não pertence ao pipeline atual.", id);
    if (value === null) { result[id] = null; continue; }
    const invalid = () => invalido(`Valor inválido para "${field.name}" (${field.type}).`, id);
    if (field.type === "boolean") {
      if (typeof value !== "boolean") throw invalid();
      result[id] = value;
      continue;
    }
    if (typeof value !== "string") throw invalid();
    switch (field.type) {
      case "number":
      case "money": {
        const match = /^(-?)(\d{1,18})(?:\.(\d{1,6}))?$/.exec(value);
        if (!match || (field.type === "money" && (match[3]?.length ?? 0) > 2)) throw invalid();
        const whole = match[2]!.replace(/^0+(?=\d)/, "");
        const fraction = (match[3] ?? "").replace(/0+$/, "");
        const sign = whole === "0" && !fraction ? "" : match[1];
        result[id] = `${sign}${whole}${field.type === "money" ? `.${fraction.padEnd(2, "0")}` : fraction ? `.${fraction}` : ""}`;
        break;
      }
      case "date": {
        const date = new Date(`${value}T12:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value)) throw invalid();
        result[id] = value;
        break;
      }
      case "select":
        if (!field.options.some((option) => option.id === value.toLowerCase())) throw invalid();
        result[id] = value.toLowerCase();
        break;
      case "person":
        if (!people.includes(value.toLowerCase())) throw invalid();
        result[id] = value.toLowerCase();
        break;
      case "text":
        result[id] = value.trim() || null;
        break;
    }
  }
  return result;
}

export function valoresDoPipeline(fields: readonly PipelineField[], values: CustomFieldValues): CustomFieldValues {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(values, field.id)).map((field) => [field.id, values[field.id]! ]));
}
