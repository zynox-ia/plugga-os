import { BadRequestException } from "@nestjs/common";
import type { AuditOrigin, AuditStatus, AuditType, ContestationStatus } from "@plugga/shared";

/**
 * Pure guard functions shared by the Prisma repository (real enforcement) and
 * the in-memory test double (apps/api/test/energy-audits-contestations.e2e.spec.ts),
 * mirroring the pattern in commercial.rules.ts — both must apply exactly the
 * same business rules instead of the test double silently drifting from
 * production behavior.
 */

/**
 * Mirrors, in application code, the database CHECK constraint added by the
 * foundation migration (20260807050000_energia_opm_foundation): origin =
 * ciclo_mensal requires cycleId and forbids marketMigrationId; origin =
 * migracao_ml is the inverse; origin = avulsa forbids both. Checking here
 * lets the API return a readable 400 instead of a raw Postgres constraint
 * error (see apps/api/test/energy-foundation.integration.spec.ts, which
 * proves the CHECK itself still exists).
 */
export function assertAuditOriginMatchesLinks(
  origin: AuditOrigin,
  cycleId: string | null | undefined,
  marketMigrationId: string | null | undefined,
): void {
  const hasCycle = Boolean(cycleId);
  const hasMigration = Boolean(marketMigrationId);

  if (origin === "ciclo_mensal" && !(hasCycle && !hasMigration)) {
    throw new BadRequestException(
      "auditoria com origem ciclo_mensal exige cycleId e não pode informar marketMigrationId",
    );
  }
  if (origin === "migracao_ml" && !(hasMigration && !hasCycle)) {
    throw new BadRequestException(
      "auditoria com origem migracao_ml exige marketMigrationId e não pode informar cycleId",
    );
  }
  if (origin === "avulsa" && (hasCycle || hasMigration)) {
    throw new BadRequestException("auditoria avulsa não pode estar vinculada a ciclo nem a migração");
  }
}

const RESOLVED_AUDIT_STATUSES = new Set<AuditStatus>(["resolvida", "inconclusiva", "sem_divergencia"]);

export function assertAuditCanBeResolved(current: AuditStatus): void {
  if (RESOLVED_AUDIT_STATUSES.has(current)) {
    throw new BadRequestException(`auditoria já foi resolvida (status atual: "${current}")`);
  }
}

/** A Contestation is always born from an existing Audit with type = contestacao — never created loose. */
export function assertAuditIsContestationType(type: AuditType): void {
  if (type !== "contestacao") {
    throw new BadRequestException('contestação só pode nascer de uma auditoria do tipo "contestacao"');
  }
}

export function assertAuditCanOpenContestation(status: AuditStatus): void {
  if (RESOLVED_AUDIT_STATUSES.has(status)) {
    throw new BadRequestException("não é possível abrir contestação em uma auditoria já resolvida");
  }
}

export function assertAuditHasNoContestation(hasContestation: boolean): void {
  if (hasContestation) {
    throw new BadRequestException("esta auditoria já tem uma contestação aberta");
  }
}

/**
 * Contestation transitions: rascunho → aberta → aguardando_distribuidora →
 * {deferida | indeferida | parcialmente_deferida} → encerrada. No skipping,
 * no going back (plano técnico / fluxo aprovado seção "4. Contestação").
 */
const CONTESTATION_TRANSITIONS: Record<ContestationStatus, readonly ContestationStatus[]> = {
  rascunho: ["aberta"],
  aberta: ["aguardando_distribuidora"],
  aguardando_distribuidora: ["deferida", "indeferida", "parcialmente_deferida"],
  deferida: ["encerrada"],
  indeferida: ["encerrada"],
  parcialmente_deferida: ["encerrada"],
  encerrada: [],
};

export function assertContestationTransitionAllowed(current: ContestationStatus, target: ContestationStatus): void {
  const allowed = CONTESTATION_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new BadRequestException(
      allowed.length > 0
        ? `não é possível mover contestação de "${current}" para "${target}"; próximos estados válidos: ${allowed.join(", ")}`
        : `a contestação já está encerrada e não admite novas transições`,
    );
  }
}

/** Financial result is required once a contestation closes — never just a text note. */
export function assertContestationCanClose(target: ContestationStatus, financialResult: string | null | undefined): void {
  if (target === "encerrada" && !financialResult) {
    throw new BadRequestException("encerrar uma contestação exige o resultado financeiro");
  }
}
