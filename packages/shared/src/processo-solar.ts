import { z } from "zod";

import { uuid } from "./primitivas.js";
import { solarStageRoles, type SolarStageRole } from "./solar.js";

/**
 * Tarefas internas do Comercial Solar criadas pela entrada na etapa (POP-SOL-001,
 * PLU-314). Uma por negócio/etapa: a chave da regra é única por negócio.
 */
export const SOLAR_PROCESS_TASKS = {
  atendimento: { ruleKey: "solar:atendimento", title: "PRIMEIRO CONTATO E QUALIFICAÇÃO", businessDays: 2 },
  proposta: { ruleKey: "solar:proposta", title: "ELABORAR E ENVIAR COTAÇÕES / PROPOSTAS", businessDays: 3 },
  visita: { ruleKey: "solar:visita", title: "ACOMPANHAR O.S DE VISITA TÉCNICA", businessDays: 4 },
} as const satisfies Partial<Record<SolarStageRole, { ruleKey: string; title: string; businessDays: number }>>;
export type SolarTaskRole = keyof typeof SOLAR_PROCESS_TASKS;
export const solarTaskRoles = Object.keys(SOLAR_PROCESS_TASKS) as SolarTaskRole[];

/**
 * Ativa o processo no pipeline. `validacaoKit: null` acrescenta a etapa
 * "Validação do Kit" ao fim, sem mexer nas etapas existentes (PLU-320).
 */
export const activateSolarProcessRequestSchema = z.object({
  stages: z.object({
    atendimento: uuid, qualificacao: uuid, proposta: uuid, visita: uuid, documentos: uuid,
    validacaoKit: uuid.nullable(),
  }).strict(),
}).strict().superRefine((input, ctx) => {
  const ids = Object.values(input.stages).filter((value): value is string => value !== null).map((value) => value.toLowerCase());
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["stages"], message: "Cada papel do processo precisa de uma etapa diferente." });
});
export type ActivateSolarProcessRequest = z.infer<typeof activateSolarProcessRequestSchema>;

export const solarPendencySchema = z.object({ code: z.string(), message: z.string() });
export type SolarPendency = z.infer<typeof solarPendencySchema>;

/** Situação do negócio no processo: etapa atual e o que falta para o próximo avanço. */
export const solarProcessStateSchema = z.object({
  active: z.boolean(),
  role: z.enum(solarStageRoles).nullable(),
  nextRole: z.enum(solarStageRoles).nullable(),
  pendencies: z.array(solarPendencySchema),
});
export type SolarProcessState = z.infer<typeof solarProcessStateSchema>;
