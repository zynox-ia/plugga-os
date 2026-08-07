export interface PluggamobOverviewCounts {
  sessionsToday: number;
  activeSessions: number;
  openIncidents: number;
  pendingSettlements: number;
}

export abstract class PluggamobRepository {
  abstract overview(now: Date): Promise<PluggamobOverviewCounts>;
}
