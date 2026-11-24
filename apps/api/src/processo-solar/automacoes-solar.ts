import type { Prisma } from "@prisma/client";
import { SOLAR_PROCESS_TASKS } from "@plugga/shared";

import type { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { executarTransicaoNegocio } from "../negocios/transicao-negocio.persistence";
import { carregarContextoSolar, erroDePendencias, papelNoProcesso } from "./processo-solar.persistence";
import { pendenciasDaSaida } from "./processo-solar.rules";

type Tx = Prisma.TransactionClient;

async function negocioNoProcesso(tx: Tx, dealId: string) {
  const deal = await tx.deal.findUniqueOrThrow({
    where: { id: dealId }, select: { id: true, pipelineId: true, stageId: true, status: true, version: true, pipeline: { select: { processProfile: true } } },
  });
  const processo = deal.status === "open" ? papelNoProcesso(deal.pipeline.processProfile, deal.stageId) : null;
  return processo?.role ? { deal, ...processo, role: processo.role } : null;
}

/**
 * Concluir a tarefa de Atendimento com vínculo válido avança para a
 * Qualificação na mesma transação. Sem vínculo, a conclusão é recusada e a
 * tarefa continua aberta com a orientação (PLU-317).
 */
export async function aoConcluirTarefaDoProcesso(
  tx: Tx, auditoria: AuditAppender, principal: AuthPrincipal, agora: Date, activity: { dealId: string | null; ruleKey: string | null },
): Promise<void> {
  if (!activity.dealId || activity.ruleKey !== SOLAR_PROCESS_TASKS.atendimento.ruleKey) return;
  const atual = await negocioNoProcesso(tx, activity.dealId);
  if (atual?.role !== "atendimento") return;
  const pendencies = pendenciasDaSaida("atendimento", await carregarContextoSolar(tx, atual.deal.id));
  if (pendencies.length) throw erroDePendencias(pendencies.map((item) => ({ ...item, message: `${item.message} A tarefa continua aberta.` })));
  await executarTransicaoNegocio(tx, auditoria, principal, agora, {
    kind: "stage", dealId: atual.deal.id, pipelineId: atual.deal.pipelineId, version: atual.deal.version,
    toStageId: atual.activation.stages.qualificacao, origin: "processo",
  });
}

/**
 * Salvar a Qualificação por ação humana valida os quatro dados e avança para
 * Cotações/Proposta. Gravações automáticas (agentes, integrações) não avançam.
 * Devolve true quando avançou.
 */
export async function aoSalvarQualificacao(tx: Tx, auditoria: AuditAppender, principal: AuthPrincipal, agora: Date, dealId: string): Promise<boolean> {
  if (principal.kind !== "user") return false;
  const atual = await negocioNoProcesso(tx, dealId);
  if (atual?.role !== "qualificacao") return false;
  const pendencies = pendenciasDaSaida("qualificacao", await carregarContextoSolar(tx, dealId));
  if (pendencies.length) throw erroDePendencias(pendencies);
  await executarTransicaoNegocio(tx, auditoria, principal, agora, {
    kind: "stage", dealId, pipelineId: atual.deal.pipelineId, version: atual.deal.version,
    toStageId: atual.activation.stages.proposta, origin: "processo",
  });
  return true;
}
