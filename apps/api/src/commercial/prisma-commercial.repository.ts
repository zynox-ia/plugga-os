import { Inject, Injectable } from "@nestjs/common";
import type { ActorType, Prisma } from "@prisma/client";
import {
  contractDetailSchema,
  contractListSchema,
  opportunityDetailSchema,
  opportunityListSchema,
  type ContractDetail,
  type ContractList,
  type ContractListQuery,
  type CreateContractRequest,
  type CreateOpportunityRequest,
  type LoseOpportunityRequest,
  type OpportunityContactRequest,
  type OpportunityDetail,
  type OpportunityList,
  type OpportunityListQuery,
  type RevisitOpportunityRequest,
  type UpdateContractStatusRequest,
  type UpdateOpportunityStageRequest,
  type WinOpportunityRequest,
  type NomeDeEventoAuditavel,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { transicionar } from "../common/concorrencia";
import { NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CommercialRepository } from "./commercial.repository";
import {
  assertContractCanActivate,
  assertContractHasOwnerAndNextAction,
  assertContractTransitionAllowed,
  assertOpportunityHasOwnerAndNextAction,
  assertOpportunityOpen,
} from "./commercial.rules";

/** Mesma normalização do módulo clientes: formatação não pode esconder um duplicado. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const opportunityInclude = {
  client: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  contacts: { orderBy: { createdAt: "desc" as const } },
  contracts: { select: { id: true, status: true, createdAt: true } },
};

const contractInclude = {
  client: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
};

type OpportunityRow = {
  id: string;
  title: string;
  product: string;
  stage: string;
  status: string;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  clientId: string | null;
  client: { id: string; name: string } | null;
  estimatedValue: { toFixed: (digits: number) => string } | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  lossReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contacts: { id: string; opportunityId: string; channel: string; outcome: string; note: string | null; createdAt: Date }[];
  contracts: { id: string; status: string; createdAt: Date }[];
};

type ContractRow = {
  id: string;
  status: string;
  clientId: string;
  client: { id: string; name: string };
  opportunityId: string | null;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  startsAt: Date | null;
  endsAt: Date | null;
  signedAt: Date | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 🔒 SEGURANÇA [VULN-2, auditoria zero-trust]: teto para as duas listagens
 * sem paginação de página deste módulo — nenhuma expõe `page`/`pageSize` na
 * API pública hoje. Defesa contra `findMany` sem limite crescendo com a
 * tabela inteira (CWE-770).
 */
const LIMITE_LISTAGEM = 500;

const MENSAGEM_JA_DECIDIDA = "Esta oportunidade já foi decidida por outra pessoa. Atualize a página e confira.";

@Injectable()
export class PrismaCommercialRepository extends CommercialRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {
    super();
  }

  async listOpportunities(query: OpportunityListQuery): Promise<OpportunityList> {
    const rows = await this.prisma.opportunity.findMany({
      where: {
        stage: query.stage,
        status: query.status,
        ownerId: query.ownerId,
      },
      include: opportunityInclude,
      orderBy: [{ nextActionAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: LIMITE_LISTAGEM,
    });
    return opportunityListSchema.parse({ items: rows.map((row) => this.opportunitySummary(row)) });
  }

  async opportunity(id: string): Promise<OpportunityDetail> {
    const row = await this.prisma.opportunity.findUnique({ where: { id }, include: opportunityInclude });
    if (!row) throw new NaoEncontrado("Oportunidade não encontrada.");
    return this.opportunityDetail(row);
  }

  async createOpportunity(input: CreateOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    if (input.clientId && !(await this.clientExists(input.clientId))) {
      throw new NaoEncontrado("O cliente vinculado não foi encontrado.");
    }
    if (!(await this.ownerExists(input.ownerId))) {
      throw new NaoEncontrado("O responsável informado não foi encontrado.");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.opportunity.create({
        data: {
          title: input.title,
          product: input.product,
          clientId: input.clientId,
          ownerId: input.ownerId,
          estimatedValue: input.estimatedValue,
          nextActionAt: new Date(input.nextActionAt),
          nextActionNote: input.nextActionNote,
        },
      });
      await this.auditoria.append(tx, {
        eventName: "commercial.opportunity_created" as NomeDeEventoAuditavel,
        entityType: "opportunity",
        entityId: row.id,
        actorType: this.actorType(principal),
        actorId: principal.id,
        payload: { campos: Object.keys(input) },
        occurredAt: row.createdAt,
      });
      return row;
    });

    return this.opportunity(created.id);
  }

  async updateOpportunityStage(
    id: string,
    input: UpdateOpportunityStageRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!current) throw new NaoEncontrado("Oportunidade não encontrada.");
    assertOpportunityOpen(current.status);
    if (input.ownerId && !(await this.ownerExists(input.ownerId))) {
      throw new NaoEncontrado("O responsável informado não foi encontrado.");
    }

    const nextOwnerId = input.ownerId ?? current.ownerId;
    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : current.nextActionAt;
    assertOpportunityHasOwnerAndNextAction(nextOwnerId, nextActionAt);

    await this.prisma.$transaction(async (tx) => {
      // O guard lá fora dá a mensagem amigável, mas roda antes da transação:
      // duas decisões concorrentes passariam ambas por ele. Recondicionar o
      // status no updateMany fecha a corrida, e o rollback leva o evento junto.
      await transicionar(
        tx.opportunity,
        id,
        { status: "aberta" },
        {
          stage: input.stage,
          ownerId: nextOwnerId,
          nextActionAt,
          nextActionNote: input.nextActionNote ?? current.nextActionNote,
        },
        MENSAGEM_JA_DECIDIDA,
      );
      await tx.eventLog.create({
        data: {
          eventName: "commercial.opportunity_stage_updated",
          entityType: "opportunity",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { from: current.stage, to: input.stage },
          occurredAt: new Date(),
        },
      });
    });

    return this.opportunity(id);
  }

  async registerOpportunityContact(
    id: string,
    input: OpportunityContactRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.prisma.opportunity.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NaoEncontrado("Oportunidade não encontrada.");

    await this.prisma.$transaction(async (tx) => {
      const contact = await tx.opportunityContact.create({
        data: { opportunityId: id, channel: input.channel, outcome: input.outcome, note: input.note },
      });
      await this.auditoria.append(tx, {
        eventName: "commercial.opportunity_contact_registered" as NomeDeEventoAuditavel,
        entityType: "opportunity_contact",
        entityId: contact.id,
        actorType: this.actorType(principal),
        actorId: principal.id,
        payload: { opportunityId: id, campos: Object.keys(input) },
        occurredAt: contact.createdAt,
      });
    });

    return this.opportunity(id);
  }

  async winOpportunity(
    id: string,
    input: WinOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!current) throw new NaoEncontrado("Oportunidade não encontrada.");
    assertOpportunityOpen(current.status);

    // Cliente e marcação como ganha na MESMA transação: se a segunda parte
    // falhar (ou outra pessoa decidir antes), o rollback leva o cliente junto
    // e não sobra cadastro órfão.
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const clientId = await this.resolveClientForWin(tx, input, principal, now);
      await transicionar(
        tx.opportunity,
        id,
        { status: "aberta" },
        { status: "ganha", clientId, decidedAt: now },
        MENSAGEM_JA_DECIDIDA,
      );
      await this.auditoria.append(tx, {
        eventName: "commercial.opportunity.won",
        entityType: "opportunity",
        entityId: id,
        actorType: this.actorType(principal),
        actorId: principal.id,
        payload: { clientId },
        occurredAt: now,
      });
    });

    return this.opportunity(id);
  }

  async loseOpportunity(
    id: string,
    input: LoseOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!current) throw new NaoEncontrado("Oportunidade não encontrada.");
    assertOpportunityOpen(current.status);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await transicionar(
        tx.opportunity,
        id,
        { status: "aberta" },
        { status: "perdida", lossReason: input.lossReason, decidedAt: now },
        MENSAGEM_JA_DECIDIDA,
      );
      await tx.eventLog.create({
        data: {
          eventName: "commercial.opportunity_lost",
          entityType: "opportunity",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { lossReason: input.lossReason },
          occurredAt: now,
        },
      });
    });

    return this.opportunity(id);
  }

  async revisitOpportunity(
    id: string,
    input: RevisitOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!current) throw new NaoEncontrado("Oportunidade não encontrada.");
    assertOpportunityOpen(current.status);
    if (input.ownerId && !(await this.ownerExists(input.ownerId))) {
      throw new NaoEncontrado("O responsável informado não foi encontrado.");
    }

    const nextOwnerId = input.ownerId ?? current.ownerId;
    if (!nextOwnerId) {
      throw new RequisicaoInvalida("Revisitar exige um responsável definido.");
    }

    await this.prisma.$transaction(async (tx) => {
      await transicionar(
        tx.opportunity,
        id,
        { status: "aberta" },
        {
          status: "revisitar",
          ownerId: nextOwnerId,
          nextActionAt: new Date(input.nextActionAt),
          nextActionNote: input.nextActionNote,
        },
        MENSAGEM_JA_DECIDIDA,
      );
      await tx.eventLog.create({
        data: {
          eventName: "commercial.opportunity_revisit_scheduled",
          entityType: "opportunity",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { nextActionAt: input.nextActionAt, nextActionNote: input.nextActionNote },
          occurredAt: new Date(),
        },
      });
    });

    return this.opportunity(id);
  }

  async listContracts(query: ContractListQuery): Promise<ContractList> {
    const rows = await this.prisma.contract.findMany({
      where: { status: query.status, clientId: query.clientId, ownerId: query.ownerId },
      include: contractInclude,
      orderBy: [{ nextActionAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      // 🔒 SEGURANÇA [VULN-2]
      take: LIMITE_LISTAGEM,
    });
    return contractListSchema.parse({ items: rows.map((row) => this.contractView(row)) });
  }

  async contract(id: string): Promise<ContractDetail> {
    const row = await this.prisma.contract.findUnique({ where: { id }, include: contractInclude });
    if (!row) throw new NaoEncontrado("Contrato não encontrado.");
    return contractDetailSchema.parse(this.contractView(row));
  }

  async createContract(input: CreateContractRequest, principal: AuthPrincipal): Promise<ContractDetail> {
    let clientId: string;
    let opportunityId: string | undefined;

    if (input.opportunityId) {
      const opportunity = await this.prisma.opportunity.findUnique({ where: { id: input.opportunityId } });
      if (!opportunity) throw new NaoEncontrado("Oportunidade não encontrada.");
      if (opportunity.status !== "ganha") {
        throw new RequisicaoInvalida("Um contrato só nasce de uma oportunidade ganha.");
      }
      if (!opportunity.clientId) {
        throw new RequisicaoInvalida("A oportunidade ganha não tem cliente vinculado.");
      }
      clientId = opportunity.clientId;
      opportunityId = opportunity.id;
    } else {
      if (!(await this.clientExists(input.clientId!))) throw new NaoEncontrado("Cliente não encontrado.");
      clientId = input.clientId!;
    }
    if (input.ownerId && !(await this.ownerExists(input.ownerId))) {
      throw new NaoEncontrado("O responsável informado não foi encontrado.");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contract.create({
        data: {
          clientId,
          opportunityId,
          ownerId: input.ownerId,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
          nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : undefined,
          nextActionNote: input.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "commercial.contract_created",
          entityType: "contract",
          entityId: row.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { clientId, opportunityId: opportunityId ?? null },
          occurredAt: row.createdAt,
        },
      });
      return row;
    });

    return this.contract(created.id);
  }

  async updateContractStatus(
    id: string,
    input: UpdateContractStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    const current = await this.prisma.contract.findUnique({ where: { id } });
    if (!current) throw new NaoEncontrado("Contrato não encontrado.");
    if (input.ownerId && !(await this.ownerExists(input.ownerId))) {
      throw new NaoEncontrado("O responsável informado não foi encontrado.");
    }

    assertContractTransitionAllowed(current.status, input.status);

    const nextOwnerId = input.ownerId ?? current.ownerId;
    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : current.nextActionAt;
    const nextActionNote = input.nextActionNote ?? current.nextActionNote;
    const signedAt = input.signedAt ? new Date(input.signedAt) : current.signedAt;
    const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt;

    if (input.status === "ativo") {
      assertContractCanActivate(signedAt);
    }

    assertContractHasOwnerAndNextAction(input.status, nextOwnerId, nextActionAt);

    await this.prisma.$transaction(async (tx) => {
      await transicionar(
        tx.contract,
        id,
        { status: current.status },
        {
          status: input.status,
          ownerId: nextOwnerId,
          nextActionAt,
          nextActionNote,
          signedAt,
          startsAt,
          endsAt,
        },
        `Não é possível aplicar a transição: o contrato já não está em "${current.status}".`,
      );
      await tx.eventLog.create({
        data: {
          eventName: "commercial.contract_status_updated",
          entityType: "contract",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { from: current.status, to: input.status },
          occurredAt: new Date(),
        },
      });
    });

    return this.contract(id);
  }

  private async resolveClientForWin(
    tx: Prisma.TransactionClient,
    input: WinOpportunityRequest,
    principal: AuthPrincipal,
    now: Date,
  ): Promise<string> {
    if (input.clientId) {
      const vinculado = await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
      if (!vinculado) throw new NaoEncontrado("O cliente vinculado não foi encontrado.");
      return vinculado.id;
    }

    const newClient = input.newClient!;
    // Igualdade literal escondia duplicados: "Ana@x.com" vs "ana@x.com" e
    // "(92) 90000-0000" vs "92900000000" criavam dois clientes. E-mail compara
    // sem caixa; telefone prefiltra pelos 4 últimos dígitos (contíguos em
    // qualquer formatação brasileira) e decide por só-dígitos, espelhando
    // prisma-clientes.repository.ts.
    const digitsPhone = newClient.phone ? onlyDigits(newClient.phone) : null;
    const or = [
      newClient.email ? { email: { equals: newClient.email, mode: "insensitive" as const } } : undefined,
      digitsPhone && digitsPhone.length >= 6 ? { phone: { contains: digitsPhone.slice(-4) } } : undefined,
    ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);
    if (or.length > 0) {
      const candidates = await tx.client.findMany({ where: { OR: or }, take: 50 });
      const emailLower = newClient.email?.toLowerCase() ?? null;
      const existing = candidates.find(
        (row) =>
          (emailLower !== null && row.email?.toLowerCase() === emailLower) ||
          (digitsPhone !== null && row.phone !== null && onlyDigits(row.phone) === digitsPhone),
      );
      if (existing) return existing.id;
    }

    const client = await tx.client.create({
      data: {
        name: newClient.name,
        company: newClient.company,
        phone: newClient.phone,
        email: newClient.email,
        segment: newClient.segment ?? "prospect",
      },
    });
    await this.auditoria.append(tx, {
      eventName: "clientes.client.created",
      entityType: "client",
      entityId: client.id,
      actorType: this.actorType(principal),
      actorId: principal.id,
      payload: { origem: "oportunidade" },
      occurredAt: now,
    });
    return client.id;
  }

  private async clientExists(id: string): Promise<boolean> {
    const client = await this.prisma.client.findUnique({ where: { id }, select: { id: true } });
    return client !== null;
  }

  private async ownerExists(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    return user !== null;
  }

  private opportunitySummary(row: OpportunityRow) {
    return {
      id: row.id,
      title: row.title,
      product: row.product,
      stage: row.stage,
      status: row.status,
      ownerId: row.ownerId,
      ownerName: row.owner?.name ?? null,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      estimatedValue: row.estimatedValue?.toFixed(2) ?? null,
      nextActionAt: row.nextActionAt?.toISOString() ?? null,
      nextActionNote: row.nextActionNote,
      lossReason: row.lossReason,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private opportunityDetail(row: OpportunityRow): OpportunityDetail {
    return opportunityDetailSchema.parse({
      ...this.opportunitySummary(row),
      contacts: row.contacts.map((contact) => ({
        id: contact.id,
        opportunityId: contact.opportunityId,
        channel: contact.channel,
        outcome: contact.outcome,
        note: contact.note,
        createdAt: contact.createdAt.toISOString(),
      })),
      contracts: row.contracts.map((contract) => ({
        id: contract.id,
        status: contract.status,
        createdAt: contract.createdAt.toISOString(),
      })),
    });
  }

  private contractView(row: ContractRow) {
    return {
      id: row.id,
      status: row.status,
      clientId: row.clientId,
      clientName: row.client.name,
      opportunityId: row.opportunityId,
      ownerId: row.ownerId,
      ownerName: row.owner?.name ?? null,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      signedAt: row.signedAt?.toISOString() ?? null,
      nextActionAt: row.nextActionAt?.toISOString() ?? null,
      nextActionNote: row.nextActionNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}
