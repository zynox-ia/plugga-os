import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { PluggamobRepository, type PluggamobOverviewCounts } from "./pluggamob.repository";

@Injectable()
export class PrismaPluggamobRepository extends PluggamobRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async overview(now: Date): Promise<PluggamobOverviewCounts> {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(4, 0, 0, 0); // America/Manaus midnight (UTC-4)
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const [sessionsToday, activeSessions, openIncidents, pendingSettlements] = await Promise.all([
      this.prisma.evSession.count({ where: { startedAt: { gte: startOfDay, lt: endOfDay } } }),
      this.prisma.evSession.count({ where: { status: "active" } }),
      this.prisma.incident.count({ where: { status: { in: ["open", "investigating", "blocked"] } } }),
      this.prisma.settlement.count({ where: { status: { in: ["auditing", "ready_for_review", "blocked"] } } }),
    ]);

    return { sessionsToday, activeSessions, openIncidents, pendingSettlements };
  }
}
