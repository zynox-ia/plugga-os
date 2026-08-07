import { BadRequestException } from "@nestjs/common";
import type { AuditStatus, CycleReportStatus, CycleStatus } from "@plugga/shared";

/**
 * Audit statuses that count as "concluded" for the purpose of closing a
 * cycle. Anything else (em_analise, divergencia_encontrada,
 * contestacao_aberta) is still being worked.
 */
const CONCLUDED_AUDIT_STATUSES = new Set<AuditStatus>(["resolvida", "inconclusiva", "sem_divergencia"]);

export type CycleCloseAuditRef = { status: AuditStatus; divergenceBlocksClosing: boolean };

export type CycleCloseInput = {
  status: CycleStatus;
  reportStatus: CycleReportStatus;
  reportSentAt: Date | null;
  audits: CycleCloseAuditRef[];
};

/**
 * Pure guard shared by the Prisma repository (real enforcement) and the
 * in-memory e2e double, mirroring commercial.rules.ts — one bulleted reason
 * per blocker, evaluated in the order the ticket/tech plan lists them, so
 * the message returned is always the first unmet condition.
 */
export function computeCycleCloseBlockers(input: CycleCloseInput): string[] {
  const blockers: string[] = [];

  if (input.status === "aguardando_documentos") {
    blockers.push("fatura da distribuidora não recebida");
  }

  if (input.audits.some((audit) => !CONCLUDED_AUDIT_STATUSES.has(audit.status))) {
    blockers.push("auditoria não concluída");
  }

  if (
    input.audits.some(
      (audit) => audit.divergenceBlocksClosing && !CONCLUDED_AUDIT_STATUSES.has(audit.status),
    )
  ) {
    blockers.push("divergência encontrada impede o fechamento sem resolução");
  }

  if (input.reportStatus !== "aprovado") {
    blockers.push("relatório de economia não aprovado internamente");
  }

  if (!input.reportSentAt) {
    blockers.push("relatório ainda não foi enviado ao cliente");
  }

  return blockers;
}

export function assertCycleCanClose(input: CycleCloseInput): void {
  const [firstBlocker] = computeCycleCloseBlockers(input);
  if (firstBlocker) {
    throw new BadRequestException(`ciclo não pode ser fechado: ${firstBlocker}`);
  }
}

export function assertCycleHasOwnerAndNextAction(
  status: CycleStatus,
  ownerId: string | null | undefined,
  nextActionAt: Date | null | undefined,
): void {
  if (status !== "fechado" && (!ownerId || !nextActionAt)) {
    throw new BadRequestException("ciclo ativo não pode ficar sem responsável e sem próxima ação");
  }
}
