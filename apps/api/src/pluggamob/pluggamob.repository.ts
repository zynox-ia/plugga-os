export interface PluggamobOverviewCounts {
  sessionsToday: number;
  activeSessions: number;
  openIncidents: number;
  pendingSettlements: number;
}

export abstract class PluggamobRepository {
  abstract overview(now: Date): Promise<PluggamobOverviewCounts>;
  abstract reactivationQueue(): Promise<ReactivationQueue>;
  abstract userProfile(id: string): Promise<EvUserProfile>;
  abstract recordContact(userId: string, input: EvContactRequest, principal: AuthPrincipal): Promise<EvUserProfile>;
  abstract optOut(userId: string, input: EvOptOutRequest, principal: AuthPrincipal): Promise<EvUserProfile>;
}
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { EvContactRequest, EvOptOutRequest, EvUserProfile, ReactivationQueue } from "@plugga/shared";
