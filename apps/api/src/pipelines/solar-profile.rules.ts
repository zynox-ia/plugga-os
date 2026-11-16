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
  const invalid = (message: string) => new RequisicaoInvalida(message, [{ campo: "processProfile", problema: message }]);
  // A ativação só muda pelo comando próprio; a tela de configuração a preserva.
  const semAtivacao = (profile: PipelineProcessProfile | null | undefined) => profile ? { ...profile, activation: undefined } : profile;
  const informado = input === undefined ? current : input;
  if (current && JSON.stringify(semAtivacao(current)) !== JSON.stringify(semAtivacao(informado))) throw invalid("A associação do processo não pode ser removida ou alterada nesta configuração.");
  // Ativação enviada no corpo é ignorada: só o comando de ativação a grava.
  const next = current ?? (informado ? { ...informado, activation: undefined } : informado);
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

/**
 * Com o processo ativado, cada etapa do pipeline tem um papel: não se remove,
 * acrescenta nem reordena etapas fora da sequência aprovada.
 */
export function problemaDasEtapasDoProcesso(
  activation: NonNullable<PipelineProcessProfile["activation"]>, stages: readonly { id?: string | null }[], removidas: readonly string[],
): string | null {
  const mapeadas = Object.values(activation.stages);
  if (removidas.some((id) => mapeadas.includes(id.toLowerCase()))) return "Etapas do processo Solar ativado não podem ser removidas.";
  if (stages.some((stage) => !stage.id || !mapeadas.includes(stage.id.toLowerCase()))) return "O processo Solar ativado não aceita etapas novas no pipeline.";
  const ordem = stages.map((stage) => stage.id!.toLowerCase());
  return ordem.join() === mapeadas.join() ? null : "Mantenha a ordem das etapas do processo Solar ativado.";
}
