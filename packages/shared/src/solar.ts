import { z } from "zod";

import { uuid } from "./primitivas.js";

const id = uuid.transform((value) => value.toLowerCase());
const reference = z.object({ fieldId: id }).strict();
/** Associação de dados; não ativa tarefas, gates ou conversão do processo. */
export const pipelineProcessProfileSchema = z.object({
  key: z.literal("solar_commercial"),
  version: z.literal(1),
  bindings: z.object({
    installationType: z.object({
      fieldId: id,
      options: z.object({ residential: id, commercial: id, rural: id }).strict(),
    }).strict(),
    averageConsumptionKwh: reference,
    roofType: reference,
    availableAreaM2: reference,
    estimatedPowerKwp: reference,
  }).strict(),
}).strict();
export type PipelineProcessProfile = z.infer<typeof pipelineProcessProfileSchema>;

export const SOLAR_UC_CODE_MAX_LENGTH = 80;
const uc = z.object({ code: z.string().trim().min(1, "informe a UC").max(SOLAR_UC_CODE_MAX_LENGTH) }).strict();
const normalize = (code: string) => code.toLocaleLowerCase("pt-BR");
/** Dados prospectivos do negócio; nenhum ID desta ficha é ConsumerUnit.id. */
export const dealSolarProjectSchema = z.object({
  principalUc: uc.nullable(),
  beneficiaryUcs: z.array(uc.extend({ id })),
  primaryEnergyBillDocumentId: id.nullable(),
}).strict().superRefine((project, ctx) => {
  const codes = new Set(project.principalUc ? [normalize(project.principalUc.code)] : []);
  const ids = new Set<string>();
  project.beneficiaryUcs.forEach((item, index) => {
    const code = normalize(item.code);
    if (codes.has(code)) ctx.addIssue({ code: "custom", path: ["beneficiaryUcs", index, "code"], message: "UC repetida nesta ficha" });
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["beneficiaryUcs", index, "id"], message: "identificador repetido nesta ficha" });
    codes.add(code);
    ids.add(item.id);
  });
});
export type DealSolarProject = z.infer<typeof dealSolarProjectSchema>;
