import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import { evUserProfileSchema, incidentResponseSchema, pluggamobLocationsSchema, pluggamobSessionSchema, pluggamobSessionsSchema, reactivationQueueSchema, settlementDetailSchema, settlementsSchema, type EvContactRequest, type EvOptOutRequest, type EvUserProfile, type IncidentRequest, type IncidentResponse, type PluggamobLocations, type PluggamobSessions, type ReactivationQueue, type ResolveBlockerRequest, type SettlementDetail, type Settlements } from "@plugga/shared";

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

  async settlements(): Promise<Settlements> {
    const rows = await this.prisma.settlement.findMany({ include: { partner: true, lines: true }, orderBy: { weekStart: "desc" } });
    return settlementsSchema.parse({ mode: "mock", items: rows.map((row) => this.settlementSummary(row)) });
  }

  async settlement(id: string): Promise<SettlementDetail> {
    const row = await this.prisma.settlement.findUnique({ where: { id }, include: { partner: true, lines: true, credits: true } });
    if (!row) throw new NotFoundException("settlement not found");
    return settlementDetailSchema.parse({ ...this.settlementSummary(row), canClose: row.lines.every((line) => !line.blockedReason), blockers: row.lines.filter((line) => line.blockedReason).map((line) => ({ id: line.id, reason: line.blockedReason!, classification: line.classification, amount: line.amount?.toFixed(2) ?? null })), lines: row.lines.map((line) => ({ id: line.id, tokenRfid: line.tokenRfid, classification: line.classification, amount: line.amount?.toFixed(2) ?? null, blockedReason: line.blockedReason })), credits: row.credits.map((credit) => ({ id: credit.id, amount: credit.amount.toFixed(2), status: credit.status, availableAt: credit.availableAt.toISOString() })) });
  }

  async resolveBlocker(settlementId: string, lineId: string, input: ResolveBlockerRequest, principal: AuthPrincipal): Promise<SettlementDetail> {
    const line = await this.prisma.settlementLine.findFirst({ where: { id: lineId, settlementId } });
    if (!line) throw new NotFoundException("settlement line not found");
    await this.prisma.$transaction(async (tx) => { await tx.settlementLine.update({ where: { id: lineId }, data: { blockedReason: null } }); await tx.eventLog.create({ data: { eventName: "pluggamob.settlement_blocker_resolved", entityType: "settlement_line", entityId: lineId, actorType: this.actorType(principal), actorId: principal.id, payload: input, occurredAt: new Date() } }); });
    return this.settlement(settlementId);
  }

  async requestApproval(id: string, principal: AuthPrincipal): Promise<SettlementDetail> {
    const detail = await this.settlement(id); if (!detail.canClose) throw new BadRequestException("settlement has open blockers");
    await this.prisma.$transaction(async (tx) => { await tx.settlement.update({ where: { id }, data: { status: "ready_for_review" } }); await tx.eventLog.create({ data: { eventName: "pluggamob.settlement_approval_requested", entityType: "settlement", entityId: id, actorType: this.actorType(principal), actorId: principal.id, payload: {}, occurredAt: new Date() } }); }); return this.settlement(id);
  }

  async approve(id: string, principal: AuthPrincipal): Promise<SettlementDetail> {
    const detail = await this.settlement(id); if (!detail.canClose) throw new BadRequestException("settlement has open blockers"); if (detail.status !== "ready_for_review") throw new BadRequestException("settlement must be ready for review");
    await this.prisma.$transaction(async (tx) => { await tx.settlement.update({ where: { id }, data: { status: "approved" } }); await tx.eventLog.create({ data: { eventName: "pluggamob.settlement_approved", entityType: "settlement", entityId: id, actorType: this.actorType(principal), actorId: principal.id, payload: {}, occurredAt: new Date() } }); }); return this.settlement(id);
  }

  private settlementSummary(row: { id: string; partner: { name: string }; weekStart: Date; weekEnd: Date; status: "draft" | "auditing" | "ready_for_review" | "approved" | "exported" | "blocked"; lines: { amount: { toFixed: (value: number) => string } | null; blockedReason: string | null }[] }) { const total = row.lines.reduce((sum, line) => sum + Number(line.amount?.toFixed(2) ?? 0), 0); return { id: row.id, partnerName: row.partner.name, weekStart: row.weekStart.toISOString(), weekEnd: row.weekEnd.toISOString(), status: row.status, totalAmount: total.toFixed(2), blockerCount: row.lines.filter((line) => line.blockedReason).length }; }

  private sessionView(row: { id: string; externalId: string; status: "active" | "completed" | "failed" | "blocked"; startedAt: Date; endedAt: Date | null; kwh: { toFixed: (value: number) => string } | null; amount: { toFixed: (value: number) => string } | null; user: { displayName: string }; location: { name: string }; connector: { label: string } | null; incidents: unknown[] }) { return { id: row.id, externalId: row.externalId, status: row.status, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, kwh: row.kwh?.toFixed(3) ?? null, amount: row.amount?.toFixed(2) ?? null, userName: row.user.displayName, locationName: row.location.name, connectorLabel: row.connector?.label ?? null, incidentCount: row.incidents.length }; }
  private locationView(row: { id: string; partner: { name: string }; name: string; status: "active" | "inactive" | "unknown"; timezone: string; stations: { id: string; name: string; connectors: { id: string; label: string; status: string }[] }[]; incidents: unknown[] }) { return { id: row.id, partnerName: row.partner.name, name: row.name, status: row.status, timezone: row.timezone, stations: row.stations, openIncidents: row.incidents.length }; }

  private actorType(principal: AuthPrincipal): ActorType { return principal.kind === "user" ? "user" : "system"; }
}
