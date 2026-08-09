import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType, Prisma } from "@prisma/client";
import {
  clientDuplicateCandidatesResponseSchema,
  clientFichaSchema,
  clientSummarySchema,
  createClientResponseSchema,
  listClientsResponseSchema,
  type ClientDuplicateCandidate,
  type ClientDuplicateCandidatesResponse,
  type ClientFicha,
  type ClientSummary,
  type CreateClientRequest,
  type CreateClientResponse,
  type DuplicateCandidatesQuery,
  type InactivateClientRequest,
  type ListClientsQuery,
  type ListClientsResponse,
  type UpdateClientRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ClientesRepository } from "./clientes.repository";

type ClientRow = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  externalId: string | null;
  segment: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Digits-only comparison: formatting (spaces, dashes, DDI) must not hide a match. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Diacritic/case/punctuation-insensitive comparison so "José" matches "jose". */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

@Injectable()
export class PrismaClientesRepository extends ClientesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async list(query: ListClientsQuery): Promise<ListClientsResponse> {
    const where: Prisma.ClientWhereInput = {};
    if (query.segment) where.segment = query.segment;
    if (query.active !== undefined) where.active = query.active === "true";
    if (query.q) {
      const term = query.q.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { company: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
        { email: { contains: term, mode: "insensitive" } },
        { externalId: { contains: term, mode: "insensitive" } },
      ];
    }

    const rows = await this.prisma.client.findMany({ where, orderBy: { name: "asc" }, take: 100 });
    return listClientsResponseSchema.parse({ mode: "mock", items: rows.map((row) => this.summary(row)) });
  }

  async get(id: string): Promise<ClientSummary> {
    const row = await this.prisma.client.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("client not found");
    return clientSummarySchema.parse(this.summary(row));
  }

  async create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse> {
    const candidateRows = await this.findDuplicateRows({ name: input.name, phone: input.phone, email: input.email });

    const created = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: input.name,
          company: input.company,
          phone: input.phone,
          email: input.email,
          externalId: input.externalId,
          segment: input.segment ?? "prospect",
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "clientes.client_created",
          entityType: "client",
          entityId: client.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { input, duplicateCandidateIds: candidateRows.map(([row]) => row.id) },
          occurredAt: client.createdAt,
        },
      });
      return client;
    });

    return createClientResponseSchema.parse({
      mode: "mock",
      client: this.summary(created),
      duplicateCandidates: candidateRows.map(([row, matchedOn]) => this.duplicateCandidate(row, matchedOn)),
    });
  }

  async update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientSummary> {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("client not found");

    const updated = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.update({ where: { id }, data: { ...input } });
      await tx.eventLog.create({
        data: {
          eventName: "clientes.client_updated",
          entityType: "client",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { input },
          occurredAt: new Date(),
        },
      });
      return client;
    });

    return clientSummarySchema.parse(this.summary(updated));
  }

  async activate(id: string, principal: AuthPrincipal): Promise<ClientSummary> {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("client not found");

    if (existing.active) return clientSummarySchema.parse(this.summary(existing));

    const updated = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.update({ where: { id }, data: { active: true } });
      await tx.eventLog.create({
        data: {
          eventName: "clientes.client_activated",
          entityType: "client",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: {},
          occurredAt: new Date(),
        },
      });
      return client;
    });

    return clientSummarySchema.parse(this.summary(updated));
  }

  async inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientSummary> {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("client not found");

    if (!existing.active) return clientSummarySchema.parse(this.summary(existing));

    const updated = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.update({ where: { id }, data: { active: false } });
      await tx.eventLog.create({
        data: {
          eventName: "clientes.client_inactivated",
          entityType: "client",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { reason: input.reason ?? null },
          occurredAt: new Date(),
        },
      });
      return client;
    });

    return clientSummarySchema.parse(this.summary(updated));
  }

  async duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> {
    if (!query.name && !query.phone && !query.email) {
      throw new BadRequestException("at least one of name, phone or email is required");
    }
    const rows = await this.findDuplicateRows(query);
    return clientDuplicateCandidatesResponseSchema.parse({
      mode: "mock",
      candidates: rows.map(([row, matchedOn]) => this.duplicateCandidate(row, matchedOn)),
    });
  }

  async ficha(id: string): Promise<ClientFicha> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        opportunities: { include: { contacts: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } },
        contracts: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!client) throw new NotFoundException("client not found");

    const opportunityIds = client.opportunities.map((opportunity) => opportunity.id);
    const contractIds = client.contracts.map((contract) => contract.id);

    const [pluggamobLink, timelineRows, agentActionRows] = await Promise.all([
      this.pluggamobLink(client.externalId),
      this.prisma.eventLog.findMany({
        where: {
          OR: [
            { entityType: "client", entityId: id },
            ...(opportunityIds.length > 0 ? [{ entityType: "opportunity", entityId: { in: opportunityIds } }] : []),
            ...(contractIds.length > 0 ? [{ entityType: "contract", entityId: { in: contractIds } }] : []),
          ],
        },
        orderBy: { occurredAt: "desc" },
        take: 50,
      }),
      this.prisma.agentAction.findMany({
        where: { entityType: "client", entityId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const contacts = client.opportunities.flatMap((opportunity) =>
      opportunity.contacts.map((contact) => ({
        id: contact.id,
        channel: contact.channel,
        outcome: contact.outcome,
        note: contact.note,
        createdAt: contact.createdAt.toISOString(),
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
      })),
    );
    contacts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return clientFichaSchema.parse({
      mode: "mock",
      resumo: this.summary(client),
      contatos: contacts,
      oportunidades: client.opportunities.map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.title,
        product: opportunity.product,
        stage: opportunity.stage,
        status: opportunity.status,
        estimatedValue: opportunity.estimatedValue?.toFixed(2) ?? null,
        nextActionAt: opportunity.nextActionAt?.toISOString() ?? null,
      })),
      contratos: client.contracts.map((contract) => ({
        id: contract.id,
        status: contract.status,
        startsAt: contract.startsAt?.toISOString() ?? null,
        endsAt: contract.endsAt?.toISOString() ?? null,
        signedAt: contract.signedAt?.toISOString() ?? null,
      })),
      energiaOpm: { available: false, reason: "Energia & OPM ainda não tem modelo de domínio implementado neste bloco." },
      pluggamob: pluggamobLink,
      financeiro: { status: "em_breve", message: "Financeiro do cliente ainda não foi implementado neste bloco." },
      documentos: { status: "em_breve", message: "Documentos do cliente ainda não foi implementado neste bloco." },
      timeline: timelineRows.map((row) => ({
        id: row.id,
        eventName: row.eventName,
        entityType: row.entityType,
        entityId: row.entityId,
        actorType: row.actorType,
        occurredAt: row.occurredAt.toISOString(),
      })),
      acoesDoAgente: agentActionRows.map((row) => ({
        id: row.id,
        agent: row.agent,
        action: row.action,
        decision: row.decision,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }

  private async pluggamobLink(externalId: string | null): Promise<ClientFicha["pluggamob"]> {
    if (!externalId) {
      return { available: false, reason: "Cliente sem externalId cadastrado — sem vínculo PluggaMob." };
    }
    const evUser = await this.prisma.evUser.findUnique({ where: { externalId } });
    if (!evUser) {
      return { available: false, reason: "Nenhum usuário PluggaMob (EV Point) encontrado para este externalId." };
    }
    return {
      available: true,
      externalId: evUser.externalId,
      segment: evUser.segment,
      walletBalance: evUser.walletBalance?.toFixed(2) ?? null,
      lastSessionAt: evUser.lastSessionAt?.toISOString() ?? null,
      phoneMasked: evUser.phoneMasked,
    };
  }

  /** Bounded, dependency-free duplicate lookup: a small candidate set from a loose SQL prefilter, narrowed by exact normalized comparison in-process. */
  private async findDuplicateRows(input: { name?: string; phone?: string; email?: string }): Promise<Array<[ClientRow, ClientDuplicateCandidate["matchedOn"]]>> {
    const digitsPhone = input.phone ? onlyDigits(input.phone) : null;
    const emailLower = input.email?.trim().toLowerCase() ?? null;
    const nameNorm = input.name ? normalizeName(input.name) : null;
    const nameToken = nameNorm ? nameNorm.split(" ")[0] : null;

    const or: Prisma.ClientWhereInput[] = [];
    if (emailLower) or.push({ email: { equals: emailLower, mode: "insensitive" } });
    // -4, não -8: num telefone formatado ("90000-0000") os 8 últimos incluem o
    // hífen e o contains nunca casa; só os 4 finais são contíguos em qualquer
    // formatação brasileira. O pós-filtro por só-dígitos abaixo decide.
    if (digitsPhone && digitsPhone.length >= 6) or.push({ phone: { contains: digitsPhone.slice(-4) } });
    if (nameToken && nameToken.length >= 3) or.push({ name: { contains: nameToken, mode: "insensitive" } });
    if (or.length === 0) return [];

    // take maior porque o prefiltro de telefone ficou mais largo com 4 dígitos.
    const rows = await this.prisma.client.findMany({ where: { OR: or }, take: 50 });

    const results: Array<[ClientRow, ClientDuplicateCandidate["matchedOn"]]> = [];
    for (const row of rows) {
      const matchedOn: ClientDuplicateCandidate["matchedOn"] = [];
      if (emailLower && row.email?.toLowerCase() === emailLower) matchedOn.push("email");
      if (digitsPhone && row.phone && onlyDigits(row.phone) === digitsPhone) matchedOn.push("phone");
      if (nameNorm) {
        const rowNameNorm = normalizeName(row.name);
        if (rowNameNorm === nameNorm || rowNameNorm.includes(nameNorm) || nameNorm.includes(rowNameNorm)) matchedOn.push("name");
      }
      if (matchedOn.length > 0) results.push([row, matchedOn]);
    }
    return results;
  }

  private duplicateCandidate(row: ClientRow, matchedOn: ClientDuplicateCandidate["matchedOn"]): ClientDuplicateCandidate {
    return { ...this.summary(row), matchedOn };
  }

  private summary(row: ClientRow): ClientSummary {
    return {
      id: row.id,
      name: row.name,
      company: row.company,
      phone: row.phone,
      email: row.email,
      externalId: row.externalId,
      segment: row.segment as ClientSummary["segment"],
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}
