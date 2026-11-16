import {
  pendenciasDaQualificacao, solarStageRoles, SOLAR_STAGE_ROLE_LABELS,
  type LeadSolarProject, type SolarPendency, type SolarProcessActivation, type SolarStageRole,
} from "@plugga/shared";

/** Fatos do negócio lidos na mesma transação da transição. */
export type ContextoSolar = {
  vinculo: { nome: boolean; contato: boolean; cliente: boolean };
  /** Projetos do lead com as contas de energia ainda disponíveis (prontas e não arquivadas). */
  projetos: Pick<LeadSolarProject, "installationType" | "averageConsumptionKwh" | "consumerUnit" | "energyBillDocumentIds">[];
};

export const ordemDoPapel = (role: SolarStageRole) => solarStageRoles.indexOf(role);

export function papelDaEtapa(activation: SolarProcessActivation, stageId: string): SolarStageRole | null {
  const id = stageId.toLowerCase();
  return solarStageRoles.find((role) => activation.stages[role] === id) ?? null;
}

export function proximoPapel(role: SolarStageRole): SolarStageRole | null {
  return solarStageRoles[ordemDoPapel(role) + 1] ?? null;
}

/** Atendimento: lead identificado (nome) com contato ou Cliente existente vinculado. */
export function vinculoValido(contexto: ContextoSolar): boolean {
  return contexto.vinculo.cliente || (contexto.vinculo.nome && contexto.vinculo.contato);
}

/** O que precisa estar registrado para sair de uma etapa rumo à seguinte. */
export function pendenciasDaSaida(role: SolarStageRole, contexto: ContextoSolar): SolarPendency[] {
  switch (role) {
    case "atendimento":
      return vinculoValido(contexto) ? [] : [{
        code: "atendimento.vinculo",
        message: "Identifique o lead (nome e telefone ou e-mail) ou vincule o Cliente já existente.",
      }];
    case "qualificacao":
      return pendenciasDaQualificacao(contexto.projetos).map((message) => ({ code: "qualificacao.dados", message }));
    default:
      return [];
  }
}

/**
 * Avançar cobra a saída de cada etapa entre a atual (inclusive) e o destino
 * (exclusive). Etapas já passadas não são cobradas de novo (PLU-320). Entrada
 * vinda de fora do processo (criação ou transferência) parte do Atendimento.
 * Retornos não têm bloqueio.
 */
export function pendenciasDoAvanco(from: SolarStageRole | null, to: SolarStageRole, contexto: ContextoSolar): SolarPendency[] {
  const inicio = from === null ? 0 : ordemDoPapel(from);
  const fim = ordemDoPapel(to);
  if (from !== null && fim <= inicio) return [];
  return solarStageRoles.slice(inicio, fim).flatMap((role) => pendenciasDaSaida(role, contexto)
    .map((pendency) => ({ ...pendency, message: `${SOLAR_STAGE_ROLE_LABELS[role]}: ${pendency.message}` })));
}
