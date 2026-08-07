import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import { evUserProfileSchema, incidentResponseSchema, pluggamobLocationsSchema, pluggamobSessionSchema, pluggamobSessionsSchema, reactivationQueueSchema, type EvContactRequest, type EvOptOutRequest, type EvUserProfile, type IncidentRequest, type IncidentResponse, type PluggamobLocations, type PluggamobSessions, type ReactivationQueue } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
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

  async reactivationQueue(): Promise<ReactivationQueue> {
    const users = await this.prisma.evUser.findMany({ where: { optedOutAt: null }, include: { contacts: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ segment: "asc" }, { lastSessionAt: "asc" }] });
    return reactivationQueueSchema.parse({ mode: "mock", items: users.map((user) => ({ id: user.id, displayName: user.displayName, phoneMasked: user.phoneMasked, segment: user.segment, lastSessionAt: user.lastSessionAt?.toISOString() ?? null, nextActionAt: user.contacts[0]?.nextActionAt?.toISOString() ?? null, walletBalance: user.walletBalance?.toFixed(2) ?? null })) });
  }

  async userProfile(id: string): Promise<EvUserProfile> {
    const user = await this.prisma.evUser.findUnique({ where: { id }, include: { segmentHistory: { orderBy: { changedAt: "desc" } }, contacts: { orderBy: { createdAt: "desc" } }, sessions: { include: { location: true }, orderBy: { startedAt: "desc" }, take: 20 }, coupons: { orderBy: { createdAt: "desc" } }, incidents: { where: { status: { in: ["open", "investigating", "blocked"] } } } } });
    if (!user) throw new NotFoundException("EV user not found");
    return evUserProfileSchema.parse({ mode: "mock", id: user.id, displayName: user.displayName, phoneMasked: user.phoneMasked, segment: user.segment, optedOutAt: user.optedOutAt?.toISOString() ?? null, walletBalance: user.walletBalance?.toFixed(2) ?? null, segmentHistory: user.segmentHistory.map((item) => ({ segment: item.segment, changedAt: item.changedAt.toISOString() })), contacts: user.contacts.map((item) => ({ id: item.id, channel: item.channel, outcome: item.outcome, nextActionAt: item.nextActionAt?.toISOString() ?? null, sessionId: item.sessionId, createdAt: item.createdAt.toISOString() })), sessions: user.sessions.map((item) => ({ id: item.id, externalId: item.externalId, status: item.status, startedAt: item.startedAt.toISOString(), locationName: item.location.name, amount: item.amount?.toFixed(2) ?? null })), locations: [...new Set(user.sessions.map((item) => item.location.name))], coupons: user.coupons.map((item) => ({ id: item.id, code: item.code, status: item.status, createdAt: item.createdAt.toISOString() })), openIncidents: user.incidents.map((item) => ({ id: item.id, kind: item.kind, severity: item.severity, summary: item.summary, status: item.status })) });
  }

  async recordContact(userId: string, input: EvContactRequest, principal: AuthPrincipal): Promise<EvUserProfile> {
    const user = await this.prisma.evUser.findUnique({ where: { id: userId }, select: { optedOutAt: true } });
    if (!user) throw new NotFoundException("EV user not found");
    if (user.optedOutAt) throw new BadRequestException("opted-out users cannot receive new contacts");
    if (input.sessionId && !(await this.prisma.evSession.findFirst({ where: { id: input.sessionId, userId }, select: { id: true } }))) throw new BadRequestException("linked session does not belong to this EV user");
    await this.prisma.$transaction(async (tx) => {
      const contact = await tx.evContact.create({ data: { userId, channel: input.channel, outcome: input.outcome, nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : undefined, sessionId: input.sessionId } });
      await tx.eventLog.create({ data: { eventName: "pluggamob.contact_recorded", entityType: "ev_contact", entityId: contact.id, actorType: this.actorType(principal), actorId: principal.id, payload: { userId, ...input }, occurredAt: new Date() } });
    });
    return this.userProfile(userId);
  }

  async optOut(userId: string, input: EvOptOutRequest, principal: AuthPrincipal): Promise<EvUserProfile> {
    const user = await this.prisma.evUser.findUnique({ where: { id: userId }, select: { optedOutAt: true } });
    if (!user) throw new NotFoundException("EV user not found");
    if (!user.optedOutAt) await this.prisma.$transaction(async (tx) => {
      const updated = await tx.evUser.update({ where: { id: userId }, data: { optedOutAt: new Date() } });
      await tx.eventLog.create({ data: { eventName: "pluggamob.user_opted_out", entityType: "ev_user", entityId: userId, actorType: this.actorType(principal), actorId: principal.id, payload: { reason: input.reason ?? null }, occurredAt: updated.optedOutAt! } });
    });
    return this.userProfile(userId);
  }

  async sessions(): Promise<PluggamobSessions> {
    const rows = await this.prisma.evSession.findMany({ include: { user: true, location: true, connector: true, incidents: true }, orderBy: { startedAt: "desc" } });
    return pluggamobSessionsSchema.parse({ mode: "mock", items: rows.map((row) => this.sessionView(row)) });
  }

  async session(id: string): Promise<PluggamobSessions["items"][number]> {
    const row = await this.prisma.evSession.findUnique({ where: { id }, include: { user: true, location: true, connector: true, incidents: true } });
    if (!row) throw new NotFoundException("EV session not found");
    return pluggamobSessionSchema.parse(this.sessionView(row));
  }

  async locations(): Promise<PluggamobLocations> {
    const rows = await this.prisma.location.findMany({ include: { partner: true, stations: { include: { connectors: true } }, incidents: { where: { status: { in: ["open", "investigating", "blocked"] } } } }, orderBy: { name: "asc" } });
    return pluggamobLocationsSchema.parse({ mode: "mock", items: rows.map((row) => this.locationView(row)) });
  }

  async location(id: string): Promise<PluggamobLocations["items"][number]> {
    const row = await this.prisma.location.findUnique({ where: { id }, include: { partner: true, stations: { include: { connectors: true } }, incidents: { where: { status: { in: ["open", "investigating", "blocked"] } } } } });
    if (!row) throw new NotFoundException("location not found");
    return pluggamobLocationsSchema.shape.items.element.parse(this.locationView(row));
  }

  async createIncident(input: IncidentRequest, principal: AuthPrincipal): Promise<IncidentResponse> {
    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({ data: { ...input } });
      await tx.eventLog.create({ data: { eventName: "pluggamob.incident_created", entityType: "incident", entityId: created.id, actorType: this.actorType(principal), actorId: principal.id, payload: input, occurredAt: created.createdAt } });
      return created;
    });
    return incidentResponseSchema.parse({ id: incident.id, status: incident.status, kind: incident.kind, severity: incident.severity, summary: incident.summary, owner: incident.owner });
  }

  private sessionView(row: { id: string; externalId: string; status: "active" | "completed" | "failed" | "blocked"; startedAt: Date; endedAt: Date | null; kwh: { toFixed: (value: number) => string } | null; amount: { toFixed: (value: number) => string } | null; user: { displayName: string }; location: { name: string }; connector: { label: string } | null; incidents: unknown[] }) { return { id: row.id, externalId: row.externalId, status: row.status, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, kwh: row.kwh?.toFixed(3) ?? null, amount: row.amount?.toFixed(2) ?? null, userName: row.user.displayName, locationName: row.location.name, connectorLabel: row.connector?.label ?? null, incidentCount: row.incidents.length }; }
  private locationView(row: { id: string; partner: { name: string }; name: string; status: "active" | "inactive" | "unknown"; timezone: string; stations: { id: string; name: string; connectors: { id: string; label: string; status: string }[] }[]; incidents: unknown[] }) { return { id: row.id, partnerName: row.partner.name, name: row.name, status: row.status, timezone: row.timezone, stations: row.stations, openIncidents: row.incidents.length }; }

  private actorType(principal: AuthPrincipal): ActorType { return principal.kind === "user" ? "user" : "system"; }
}
