import {
  solarProcessActivationSchema, solarProcessStateSchema, SOLAR_STAGE_ROLE_LABELS,
  type ActivateSolarProcessRequest, type Pipeline, type SolarProcessActivation, type SolarProcessState, type SolarStageRole,
} from "@plugga/shared";

import { enviar, lerErro } from "./clientes.ts";

export { SOLAR_STAGE_ROLE_LABELS };

/** Pipeline com o processo Solar ativado: tarefas, bloqueios e fechamento valem juntos. */
export function processoSolarAtivo(pipeline: Pick<Pipeline, "processProfile">): boolean {
  return !!pipeline.processProfile?.activation;
}

export function papelDaEtapaSolar(pipeline: Pick<Pipeline, "processProfile">, stageId: string): SolarStageRole | null {
  const stages = pipeline.processProfile?.activation?.stages;
  if (!stages) return null;
  return (Object.keys(stages) as SolarStageRole[]).find((role) => stages[role] === stageId.toLowerCase()) ?? null;
}

export async function lerSituacaoSolar(negocioId: string, signal?: AbortSignal): Promise<SolarProcessState> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/leads/${negocioId}/processo-solar`, { cache: "no-store", signal });
  } catch (erro) {
    if (signal?.aborted || (erro instanceof DOMException && erro.name === "AbortError")) throw erro;
    throw new Error("Sem conexão. Tente carregar as pendências novamente.");
  }
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(lerErro(corpo, "Não foi possível carregar as pendências do processo.").mensagem);
  const situacao = solarProcessStateSchema.safeParse(corpo);
  if (!situacao.success) throw new Error("Não foi possível interpretar as pendências do processo.");
  return situacao.data;
}

/** Sugestão inicial do mapeamento: as cinco primeiras etapas, na ordem, e a Validação do Kit criada no fim. */
export function sugestaoDeAtivacao(stageIds: readonly string[]): ActivateSolarProcessRequest["stages"] | null {
  const [atendimento, qualificacao, proposta, visita, documentos, kit] = stageIds;
  if (!atendimento || !qualificacao || !proposta || !visita || !documentos) return null;
  return { atendimento, qualificacao, proposta, visita, documentos, validacaoKit: kit ?? null };
}

export async function ativarProcessoSolar(pipelineId: string, stages: ActivateSolarProcessRequest["stages"]): Promise<SolarProcessActivation> {
  const resposta = await enviar<unknown>(`/api/pipelines/${pipelineId}/processo-solar/ativacao`, "POST", { stages });
  if (!resposta.ok) throw new Error(resposta.erro.mensagem);
  const ativacao = solarProcessActivationSchema.safeParse(resposta.dados);
  if (!ativacao.success) throw new Error("Não foi possível interpretar a ativação.");
  return ativacao.data;
}
