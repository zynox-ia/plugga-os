import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import { evUserProfileSchema, reactivationQueueSchema, type EvContactRequest, type EvOptOutRequest, type EvUserProfile, type ReactivationQueue } from "@plugga/shared";

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

  private actorType(principal: AuthPrincipal): ActorType { return principal.kind === "user" ? "user" : "system"; }
}
