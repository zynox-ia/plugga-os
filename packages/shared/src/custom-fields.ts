import { z } from "zod";

import { uuid } from "./primitivas.js";

export const pipelineFieldTypes = ["text", "number", "money", "date", "select", "boolean", "person"] as const;
export const pipelineFieldTypeSchema = z.enum(pipelineFieldTypes);
export type PipelineFieldType = z.infer<typeof pipelineFieldTypeSchema>;
const option = z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(80) }).strict();
export const pipelineFieldInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(80),
  type: pipelineFieldTypeSchema,
  options: z.array(option).max(60).optional(),
  showOnCard: z.boolean(),
  showInList: z.boolean(),
}).strict().superRefine((field, ctx) => {
  if (field.type === "select" && !field.options?.length) ctx.addIssue({ code: "custom", path: ["options"], message: "informe pelo menos uma opção" });
  if (field.type !== "select" && field.options?.length) ctx.addIssue({ code: "custom", path: ["options"], message: "somente seleção aceita opções" });
  const names = new Set<string>();
  const ids = new Set<string>();
  field.options?.forEach((item, i) => {
    const name = item.name.toLocaleLowerCase("pt-BR");
    if (names.has(name) || (item.id && ids.has(item.id.toLowerCase()))) ctx.addIssue({ code: "custom", path: ["options", i], message: "opção repetida" });
    names.add(name);
    if (item.id) ids.add(item.id.toLowerCase());
  });
});
export type PipelineFieldInput = z.infer<typeof pipelineFieldInputSchema>;
export const pipelineFieldsInputSchema = z.array(pipelineFieldInputSchema).max(40).superRefine((fields, ctx) => {
  const names = new Set<string>();
  const ids = new Set<string>();
  fields.forEach((field, i) => {
    const name = field.name.toLocaleLowerCase("pt-BR");
    if (names.has(name) || (field.id && ids.has(field.id.toLowerCase()))) ctx.addIssue({ code: "custom", path: [i], message: "campo repetido" });
    names.add(name);
    if (field.id) ids.add(field.id.toLowerCase());
  });
});
export const pipelineFieldSchema = z.object({
  id: uuid, name: z.string(), type: pipelineFieldTypeSchema,
  options: z.array(z.object({ id: uuid, name: z.string() })),
  showOnCard: z.boolean(), showInList: z.boolean(),
  position: z.number().int().nonnegative(), valueCount: z.number().int().nonnegative(),
});
export type PipelineField = z.infer<typeof pipelineFieldSchema>;
export const customFieldValuesSchema = z.record(uuid, z.union([z.string().max(4000), z.boolean(), z.null()]))
  .refine((values) => Object.keys(values).length <= 40, "limite de 40 campos por edição")
  .refine((values) => new Set(Object.keys(values).map((id) => id.toLowerCase())).size === Object.keys(values).length, "campo repetido");
export type CustomFieldValues = z.infer<typeof customFieldValuesSchema>;
