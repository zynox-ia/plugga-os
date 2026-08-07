import { Inject, Injectable } from "@nestjs/common";
import { pluggamobOverviewSchema, type EvContactRequest, type EvOptOutRequest, type EvUserProfile, type IncidentRequest, type IncidentResponse, type PluggamobLocations, type PluggamobOverview, type PluggamobSessions, type ReactivationQueue } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PluggamobRepository } from "./pluggamob.repository";

@Injectable()
export class PluggamobService {
  constructor(@Inject(PluggamobRepository) private readonly repository: PluggamobRepository) {}

  async overview(): Promise<PluggamobOverview> {
    const generatedAt = new Date();
    const counts = await this.repository.overview(generatedAt);
    return pluggamobOverviewSchema.parse({ mode: "mock", ...counts, generatedAt: generatedAt.toISOString() });
  }

  reactivationQueue(): Promise<ReactivationQueue> { return this.repository.reactivationQueue(); }
  userProfile(id: string): Promise<EvUserProfile> { return this.repository.userProfile(id); }
  recordContact(userId: string, input: EvContactRequest, principal: AuthPrincipal): Promise<EvUserProfile> { return this.repository.recordContact(userId, input, principal); }
  optOut(userId: string, input: EvOptOutRequest, principal: AuthPrincipal): Promise<EvUserProfile> { return this.repository.optOut(userId, input, principal); }
  sessions(): Promise<PluggamobSessions> { return this.repository.sessions(); }
  session(id: string): Promise<PluggamobSessions["items"][number]> { return this.repository.session(id); }
  locations(): Promise<PluggamobLocations> { return this.repository.locations(); }
  location(id: string): Promise<PluggamobLocations["items"][number]> { return this.repository.location(id); }
  createIncident(input: IncidentRequest, principal: AuthPrincipal): Promise<IncidentResponse> { return this.repository.createIncident(input, principal); }
}
