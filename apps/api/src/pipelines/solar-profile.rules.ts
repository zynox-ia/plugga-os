import { pipelineProcessProfileSchema, type PipelineField, type PipelineProcessProfile } from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";

export const lerPerfilDeProcesso = (value: unknown): PipelineProcessProfile | null =>
  value === null || value === undefined ? null : pipelineProcessProfileSchema.parse(value);

/** Só associa dados. A ativação operacional do processo é outra entrega. */
export function configurarPerfilDeProcesso(
  current: PipelineProcessProfile | null,
  input: PipelineProcessProfile | null | undefined,
  fields: readonly PipelineField[],
): PipelineProcessProfile | null {
  const next = input === undefined ? current : input;
  const invalid = (message: string) => new RequisicaoInvalida(message, [{ campo: "processProfile", problema: message }]);
  if (current && JSON.stringify(current) !== JSON.stringify(next)) throw invalid("A associação do processo não pode ser removida ou alterada nesta configuração.");
  if (!next) return null;
  const bindings = Object.entries(next.bindings);
  if (new Set(bindings.map(([, binding]) => binding.fieldId)).size !== bindings.length) throw invalid("Cada dado do processo precisa de um campo distinto.");
  for (const [semantic, binding] of bindings) {
    const field = fields.find((field) => field.id === binding.fieldId);
    const type = semantic === "installationType" || semantic === "roofType" ? "select" : "number";
    if (!field || field.type !== type) throw invalid("Os campos associados ao processo precisam pertencer ao pipeline e manter seus tipos.");
  }
  const installation = next.bindings.installationType;
  const options = Object.values(installation.options);
  const field = fields.find((field) => field.id === installation.fieldId)!;
  if (new Set(options).size !== options.length || options.some((id) => !field.options.some((option) => option.id === id))) {
    throw invalid("As opções de instalação associadas precisam ser distintas e pertencer ao campo de instalação.");
  }
  return next;
}
