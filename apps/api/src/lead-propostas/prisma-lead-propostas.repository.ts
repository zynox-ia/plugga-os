import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  leadDocumentSchema, leadProposalContentSchema, leadProposalSchema, listLeadProposalTemplatesResponseSchema,
  type CreateLeadProposalRequest, type LeadDocument, type LeadProposal, type UpdateLeadProposalRequest,
} from "@plugga/shared";

import { EstadoInvalido, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { hojeNoFuso } from "../negocios/negocios.rules";
import { exigeDonoComercial, lerAcessoComercial, pessoaVisivelComercial } from "../pipelines/acesso-comercial";
import { podeVer, type AcessoComercial } from "../pipelines/pipelines.rules";
import { PrismaService } from "../prisma/prisma.service";
import { type GeracaoDeProposta, LeadPropostasRepository } from "./lead-propostas.repository";

const INCLUDE = {
  template: true,
  versions: { orderBy: { version: "desc" }, take: 1, include: { document: { include: {
    uploadedBy: { select: { id: true, name: true } }, archivedBy: { select: { id: true, name: true } },
  } } } },
} satisfies Prisma.LeadProposalInclude;
type Linha = Prisma.LeadProposalGetPayload<{ include: typeof INCLUDE }>;
type Banco = Prisma.TransactionClient;
const CONFLITO = "Esta proposta mudou ou está sendo gerada. Atualize a tela e tente novamente.";
const PRAZO_GERACAO_MS = 15 * 60 * 1000;

function paraProposta(row: Linha, pessoaId: string, acesso: AcessoComercial): LeadProposal {
  const latest = row.versions[0];
  const doc = latest?.document;
  // A configuração pode mudar; uma versão gerada continua descrevendo seu snapshot.
  const template = row.status === "generated" && latest ? latest.templateSnapshot as { name: string; style: string } : row.template;
  return leadProposalSchema.parse({
    ...row, templateName: template.name, templateStyle: template.style,
    document: doc ? leadDocumentSchema.parse({
      ...doc, uploadedBy: pessoaVisivelComercial(acesso, pessoaId, doc.uploadedBy), archivedBy: pessoaVisivelComercial(acesso, pessoaId, doc.archivedBy),
      canPreview: true, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString(), archivedAt: doc.archivedAt?.toISOString() ?? null,
    }) : null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
}

@Injectable()
export class PrismaLeadPropostasRepository extends LeadPropostasRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { super(); }

  async list(dealId: string, principal: AuthPrincipal) {
    const { acesso } = await this.prisma.comContexto((tx) => this.visible(tx, dealId, principal));
    const rows = await this.prisma.comContexto((tx) => tx.leadProposal.findMany({ where: { dealId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: INCLUDE }));
    return { proposals: rows.map((row) => paraProposta(row, principal.id, acesso)) };
  }

  async templates(dealId: string, principal: AuthPrincipal) {
    const deal = await this.prisma.comContexto((tx) => this.visible(tx, dealId, principal));
    const templates = await this.prisma.comContexto((tx) => tx.leadProposalTemplate.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] }));
    const expiry = new Date(`${hojeNoFuso()}T12:00:00Z`);
    expiry.setUTCDate(expiry.getUTCDate() + 15);
    const lead = deal.profile;
    return listLeadProposalTemplatesResponseSchema.parse({ templates: templates.map((template) => ({
      ...template,
      defaults: leadProposalContentSchema.parse({
        introduction: (template.defaults as Record<string, unknown>).introduction,
        scope: lead?.mainInterest || (template.defaults as Record<string, unknown>).scope,
        payment: (template.defaults as Record<string, unknown>).payment,
        title: `Proposta comercial · ${lead?.name ?? deal.title}`.slice(0, 300),
        recipient: lead?.name ?? deal.title, company: lead?.companyName ?? "", email: lead?.email ?? "", phone: lead?.phone ?? "",
        city: [lead?.city, lead?.state].filter(Boolean).join(" / "), owner: deal.owner.name, jobTitle: lead?.jobTitle ?? "",
        amount: deal.value?.toFixed(2) ?? "", validUntil: expiry.toISOString().slice(0, 10),
        notes: lead?.notes ?? "",
      }),
    })) });
  }

  async get(dealId: string, id: string, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
      const { acesso } = await this.visible(tx, dealId, principal);
      return paraProposta(await this.row(tx, dealId, id), principal.id, acesso);
    });
  }

  async create(dealId: string, input: CreateLeadProposalRequest, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
      const { acesso } = await this.visible(tx, dealId, principal, true);
      await this.template(tx, input.templateId);
      return paraProposta(await tx.leadProposal.create({ data: { dealId, templateId: input.templateId, content: input.content }, include: INCLUDE }), principal.id, acesso);
    });
  }

  async update(dealId: string, id: string, input: UpdateLeadProposalRequest, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
      const { acesso } = await this.visible(tx, dealId, principal, true);
      await this.row(tx, dealId, id);
      await this.template(tx, input.templateId);
      const updated = await tx.leadProposal.updateMany({
        where: { id, dealId, revision: input.revision, OR: this.unlocked() },
        data: { templateId: input.templateId, content: input.content, status: "draft", revision: { increment: 1 }, generationToken: null, generationStartedAt: null },
      });
      if (updated.count !== 1) throw new EstadoInvalido(CONFLITO);
      return paraProposta(await this.row(tx, dealId, id), principal.id, acesso);
    });
  }

  async beginGeneration(dealId: string, id: string, revision: number, principal: AuthPrincipal): Promise<GeracaoDeProposta> {
    return this.prisma.comContexto(async (tx) => {
      const { acesso } = await this.visible(tx, dealId, principal, true);
      await this.row(tx, dealId, id);
      const token = randomUUID();
      const claimed = await tx.leadProposal.updateMany({
        where: { id, dealId, revision, status: "draft", OR: this.unlocked() },
        data: { generationToken: token, generationStartedAt: new Date() },
      });
      if (claimed.count !== 1) throw new EstadoInvalido(CONFLITO);
      return { proposal: paraProposta(await this.row(tx, dealId, id), principal.id, acesso), token };
    });
  }

  async completeGeneration(dealId: string, generation: GeracaoDeProposta, document: LeadDocument, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
      // A sessão e o negócio podem ter mudado enquanto o PDF era enviado ao storage.
      const { acesso } = await this.visible(tx, dealId, principal, true);
      const { proposal, token } = generation;
      const stored = await tx.leadDocument.findFirst({ where: { id: document.id, dealId, uploadState: "ready", category: "proposta" }, select: { id: true } });
      if (!stored) throw new NaoEncontrado("Documento não encontrado.");
      const updated = await tx.leadProposal.updateMany({
        where: { id: proposal.id, dealId, revision: proposal.revision, generationToken: token, status: "draft" },
        data: { status: "generated", version: { increment: 1 }, revision: { increment: 1 }, generationToken: null, generationStartedAt: null },
      });
      if (updated.count !== 1) throw new EstadoInvalido(CONFLITO);
      await tx.leadProposalVersion.create({ data: {
        proposalId: proposal.id, version: proposal.version + 1, documentId: document.id, content: proposal.content,
        templateSnapshot: { id: proposal.templateId, name: proposal.templateName, style: proposal.templateStyle },
      } });
      return paraProposta(await this.row(tx, dealId, proposal.id), principal.id, acesso);
    });
  }

  async releaseGeneration(id: string, token: string) {
    await this.prisma.comContexto((tx) => tx.leadProposal.updateMany({ where: { id, generationToken: token }, data: { generationToken: null, generationStartedAt: null } }));
  }

  private unlocked(): Prisma.LeadProposalWhereInput[] {
    // Recupera tentativas abandonadas após queda do processo; o token impede conclusão tardia.
    return [{ generationToken: null }, { generationStartedAt: { lt: new Date(Date.now() - PRAZO_GERACAO_MS) } }];
  }

  private async template(tx: Banco, id: string) {
    const template = await tx.leadProposalTemplate.findUnique({ where: { id } });
    if (!template) throw new NaoEncontrado("Modelo de proposta não encontrado.");
    return template;
  }

  private async row(tx: Banco, dealId: string, id: string) {
    const row = await tx.leadProposal.findFirst({ where: { id, dealId }, include: INCLUDE });
    if (!row) throw new NaoEncontrado("Proposta não encontrada.");
    return row;
  }

  private async visible(tx: Banco, dealId: string, principal: AuthPrincipal, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`;
    const [deal, access] = await Promise.all([
      tx.deal.findUnique({ where: { id: dealId }, include: { profile: true, owner: { select: { name: true } } } }),
      lerAcessoComercial(tx, principal.id),
    ]);
    if (!deal || !podeVer(access)) throw new NaoEncontrado("Negócio não encontrado.");
    exigeDonoComercial(access, principal.id, deal.ownerId);
    return { ...deal, acesso: access };
  }
}
