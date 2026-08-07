import { BadRequestException } from "@nestjs/common";
import { MARKET_MIGRATION_STAGE_SEQUENCE, type MarketMigrationStage, type MarketMigrationStatus } from "@plugga/shared";

/** Statuses in which a market migration is still an open, working journey. */
export const OPEN_MARKET_MIGRATION_STATUSES = new Set<MarketMigrationStatus>(["em_andamento"]);

/**
 * Pure guard functions shared by the Prisma repository (real enforcement) and
 * the in-memory test double (apps/api/test/market-migrations.e2e.spec.ts), so
 * both apply exactly the same business rules instead of the test double
 * silently drifting from production behavior (same pattern as
 * commercial.rules.ts).
 */

export function assertMarketMigrationOpen(status: MarketMigrationStatus): void {
  if (!OPEN_MARKET_MIGRATION_STATUSES.has(status)) {
    throw new BadRequestException("migração já foi encerrada (ativada ou cancelada)");
  }
}

export function assertMarketMigrationHasOwnerAndNextAction(
  ownerId: string | null | undefined,
  nextActionAt: Date | null | undefined,
): void {
  if (!ownerId || !nextActionAt) {
    throw new BadRequestException("migração em andamento não pode ficar sem responsável e sem próxima ação");
  }
}

export function assertMarketMigrationStageTransitionAllowed(
  current: MarketMigrationStage,
  target: MarketMigrationStage,
): void {
  const currentIndex = MARKET_MIGRATION_STAGE_SEQUENCE.indexOf(current);
  const targetIndex = MARKET_MIGRATION_STAGE_SEQUENCE.indexOf(target);
  if (targetIndex !== currentIndex && targetIndex !== currentIndex + 1) {
    const nextValid = MARKET_MIGRATION_STAGE_SEQUENCE[currentIndex + 1];
    throw new BadRequestException(
      nextValid
        ? `não é possível pular de "${current}" para "${target}"; a próxima etapa válida é "${nextValid}"`
        : `a migração já está em "${current}" e não admite novas etapas`,
    );
  }
}
