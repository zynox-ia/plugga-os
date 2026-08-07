import { BadRequestException } from "@nestjs/common";
import { CONTRACT_STATUS_SEQUENCE, type ContractStatus, type OpportunityStatus } from "@plugga/shared";

/** Statuses in which an opportunity is still an open, working decision. */
export const OPEN_OPPORTUNITY_STATUSES = new Set<OpportunityStatus>(["aberta"]);

/**
 * Contract statuses where the active-opportunity blocking rule applies: a
 * contract being worked (not a bare draft, not already closed) may never sit
 * without an owner and a next action. "rascunho" and "encerrado" are exempt —
 * a draft has no urgency yet, and a closed contract has no future action.
 */
export const CONTRACT_STATUSES_REQUIRING_OWNER_AND_NEXT_ACTION = new Set<ContractStatus>([
  "revisao_interna",
  "aguardando_assinatura",
  "ativo",
  "vencendo",
]);

/**
 * Pure guard functions shared by the Prisma repository (real enforcement) and
 * the in-memory test double (apps/api/test/commercial.e2e.spec.ts), so both
 * apply exactly the same business rules instead of the test double silently
 * drifting from production behavior.
 */

export function assertOpportunityOpen(status: OpportunityStatus): void {
  if (!OPEN_OPPORTUNITY_STATUSES.has(status)) {
    throw new BadRequestException("oportunidade já foi decidida");
  }
}

export function assertOpportunityHasOwnerAndNextAction(
  ownerId: string | null | undefined,
  nextActionAt: Date | null | undefined,
): void {
  if (!ownerId || !nextActionAt) {
    throw new BadRequestException("oportunidade aberta não pode ficar sem responsável e sem próxima ação");
  }
}

export function assertContractTransitionAllowed(current: ContractStatus, target: ContractStatus): void {
  const currentIndex = CONTRACT_STATUS_SEQUENCE.indexOf(current);
  const targetIndex = CONTRACT_STATUS_SEQUENCE.indexOf(target);
  if (targetIndex !== currentIndex && targetIndex !== currentIndex + 1) {
    const nextValid = CONTRACT_STATUS_SEQUENCE[currentIndex + 1];
    throw new BadRequestException(
      nextValid
        ? `não é possível pular de "${current}" para "${target}"; o próximo estado válido é "${nextValid}"`
        : "o contrato já está encerrado e não admite novas transições",
    );
  }
}

export function assertContractCanActivate(signedAt: Date | null | undefined): void {
  if (!signedAt) {
    throw new BadRequestException(
      "contrato não pode ficar ativo sem assinatura confirmada; permaneça em aguardando_assinatura",
    );
  }
}

export function assertContractHasOwnerAndNextAction(
  status: ContractStatus,
  ownerId: string | null | undefined,
  nextActionAt: Date | null | undefined,
): void {
  if (CONTRACT_STATUSES_REQUIRING_OWNER_AND_NEXT_ACTION.has(status) && (!ownerId || !nextActionAt)) {
    throw new BadRequestException("contrato em andamento não pode ficar sem responsável e sem próxima ação");
  }
}
