import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ActorType } from "@prisma/client";
import {
  dealClientOptionsResponseSchema,
  dealSchema,
  listDealsResponseSchema,
  type BulkDealsRequest,
  type CreateDealRequest,
  type Deal,
  type DealClientOptionsResponse,
  type ListDealsQuery,
  type ListDealsResponse,
  type LoseDealRequest,
  type MoveDealStageRequest,
  type NomeDeEventoAuditavel,
  type TransferDealRequest,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { lerAcessoComercial } from "../pipelines/acesso-comercial";
import { podeVer } from "../pipelines/pipelines.rules";
import { PrismaService } from "../prisma/prisma.service";
import { NegociosRepository } from "./negocios.repository";
import { foraDe, hojeNoFuso, problemaDaPerda } from "./negocios.rules";

const DO_NEGOCIO = {
  pipeline: { select: { companyId: true } },
  client: { select: { id: true, name: true, personType: true } },
  contact: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true, position: true } } } },
  consumerUnits: { include: { consumerUnit: { select: { id: true, code: true } } } },
} satisfies Prisma.DealInclude;

type LinhaDeNegocio = Prisma.DealGetPayload<{ include: typeof DO_NEGOCIO }>;

const DO_PIPELINE = {
  stages: { select: { id: true, name: true } },
  tags: { select: { id: true } },
  lossReasons: { select: { id: true, name: true, asksRevisitDate: true } },
  members: { select: { userId: true, role: true } },
} satisfies Prisma.PipelineInclude;

type PipelineDoNegocio = Prisma.PipelineGetPayload<{ include: typeof DO_PIPELINE }>;

const NEGOCIO_NAO_ENCONTRADO = "Negócio não encontrado.";
const PIPELINE_NAO_ENCONTRADO = "Pipeline não encontrado.";
const SO_ABERTO = "Este negócio já foi encerrado.";

function paraNegocio(linha: LinhaDeNegocio): Deal {
  return dealSchema.parse({
    id: linha.id,
    pipelineId: linha.pipelineId,
    companyId: linha.pipeline.companyId,
    stageId: linha.stageId,
    status: linha.status,
    title: linha.title,
    value: linha.value?.toFixed(2) ?? null,
    expectedCloseDate: linha.expectedCloseDate,
    client: linha.client,
    contact: linha.contact,
    owner: linha.owner,
    tags: [...linha.tags].sort((a, b) => a.tag.position - b.tag.position).map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color })),
    consumerUnits: linha.consumerUnits.map(({ consumerUnit }) => consumerUnit),
    stageEnteredAt: linha.stageEnteredAt.toISOString(),
    closedAt: linha.closedAt?.toISOString() ?? null,
    lossReason: linha.lossReasonName,
    revisitOn: linha.revisitOn,
    createdAt: linha.createdAt.toISOString(),
  });
}

const invalido = (mensagem: string, campo: string, problema: string) => new RequisicaoInvalida(mensagem, [{ campo, problema }]);

@Injectable()
export class PrismaNegociosRepository extends NegociosRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {
    super();
  }

  async list(query: ListDealsQuery, principal: AuthPrincipal): Promise<ListDealsResponse> {
    await this.pipelineVisivel(query.pipelineId, principal);
    const linhas = await this.prisma.deal.findMany({
      where: { pipelineId: query.pipelineId, ...(query.status === "all" ? {} : { status: query.status }) },
      orderBy: { stageEnteredAt: "desc" },
      take: 2000,
      include: DO_NEGOCIO,
    });
    return listDealsResponseSchema.parse({ deals: linhas.map(paraNegocio) });
  }

  async clientOptions(clientId: string): Promise<DealClientOptionsResponse> {
    const cliente = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        contacts: { select: { id: true, name: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        consumerUnits: { select: { id: true, code: true, distributor: true }, orderBy: { code: "asc" } },
      },
    });
    if (!cliente) throw new NaoEncontrado("Cliente não encontrado.");
    return dealClientOptionsResponseSchema.parse(cliente);
  }

  async create(input: CreateDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const pipeline = await this.pipelineVisivel(input.pipelineId, principal);
    if (pipeline.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios novos.");
    const etapa = pipeline.stages.find((e) => e.id === input.stageId);
    if (!etapa) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
    this.garantirResponsavel(pipeline, input.ownerId);
    if (foraDe(input.tagIds, pipeline.tags.map((t) => t.id)).length > 0) {
      throw invalido("Use só etiquetas deste pipeline.", "tagIds", "etiqueta de outro pipeline");
    }

    const cliente = await this.prisma.client.findUnique({
      where: { id: input.clientId },
      select: { active: true, contacts: { select: { id: true } }, consumerUnits: { select: { id: true } } },
    });
    if (!cliente) throw invalido("Escolha um cliente cadastrado.", "clientId", "cliente não encontrado");
    if (!cliente.active) throw invalido("Este cliente está inativo. Reative-o antes de abrir um negócio.", "clientId", "cliente inativo");
    if (input.contactId && !cliente.contacts.some((c) => c.id === input.contactId)) {
      throw invalido("O contato precisa ser do cliente escolhido.", "contactId", "contato de outro cliente");
    }
    if (foraDe(input.consumerUnitIds, cliente.consumerUnits.map((u) => u.id)).length > 0) {
      throw invalido("As UCs precisam ser do cliente escolhido.", "consumerUnitIds", "UC de outro cliente");
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: etapa.id,
          clientId: input.clientId,
          contactId: input.contactId ?? null,
          ownerId: input.ownerId,
          title: input.title,
          value: input.value ?? null,
          expectedCloseDate: input.expectedCloseDate ?? null,
          createdById: principal.id,
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
          consumerUnits: { create: input.consumerUnitIds.map((consumerUnitId) => ({ consumerUnitId })) },
          history: { create: { kind: "created", toStageId: etapa.id, toStageName: etapa.name, toPipelineName: pipeline.name, actorId: principal.id } },
        },
        select: { id: true },
      });
      await this.registrar(tx, "commercial.deal.created", criado.id, pipeline.companyId, principal, { pipelineId: pipeline.id, stageId: etapa.id });
      return criado.id;
    });
    return this.ler(id);
  }

  async moveStage(id: string, input: MoveDealStageRequest, principal: AuthPrincipal): Promise<Deal> {
    const { negocio, pipeline } = await this.negocioAberto(id, principal);
    if (negocio.stageId === input.stageId) return this.ler(id);
    const destino = pipeline.stages.find((e) => e.id === input.stageId);
    if (!destino) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
    const origem = pipeline.stages.find((e) => e.id === negocio.stageId);

    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { stageId: destino.id, stageEnteredAt: new Date() } });
      await tx.dealHistory.create({
        data: { dealId: id, kind: "stage_changed", fromStageId: origem?.id, fromStageName: origem?.name, toStageId: destino.id, toStageName: destino.name, actorId: principal.id },
      });
    });
    return this.ler(id);
  }

  async win(id: string, principal: AuthPrincipal): Promise<Deal> {
    const { negocio, pipeline } = await this.negocioAberto(id, principal);
    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { status: "won", closedAt: new Date() } });
      await tx.dealHistory.create({ data: { dealId: id, kind: "won", fromStageId: negocio.stageId, actorId: principal.id } });
      await this.registrar(tx, "commercial.deal.won", id, pipeline.companyId, principal, { pipelineId: pipeline.id });
    });
    return this.ler(id);
  }

  async lose(id: string, input: LoseDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { negocio, pipeline } = await this.negocioAberto(id, principal);
    const motivo = pipeline.lossReasons.find((m) => m.id === input.lossReasonId) ?? null;
    const problema = problemaDaPerda(motivo, input.revisitOn, hojeNoFuso());
    if (problema) throw new RequisicaoInvalida("Confira o motivo da perda.", [problema]);

    await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id },
        data: {
          status: "lost",
          closedAt: new Date(),
          lossReasonId: motivo!.id,
          lossReasonName: motivo!.name,
          lossNote: input.note ?? null,
          revisitOn: input.revisitOn ?? null,
        },
      });
      await tx.dealHistory.create({ data: { dealId: id, kind: "lost", fromStageId: negocio.stageId, actorId: principal.id } });
      await this.registrar(tx, "commercial.deal.lost", id, pipeline.companyId, principal, { pipelineId: pipeline.id, lossReasonId: motivo!.id });
    });
    return this.ler(id);
  }

  async transfer(id: string, input: TransferDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { negocio, pipeline: origem } = await this.negocioAberto(id, principal);
    if (input.pipelineId === origem.id) throw invalido("Escolha outro pipeline.", "pipelineId", "o negócio já está neste pipeline");
    const destino = await this.pipelineVisivel(input.pipelineId, principal);
    if (destino.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios.");
    const etapa = destino.stages.find((e) => e.id === input.stageId);
    if (!etapa) throw invalido("Escolha uma etapa do pipeline de destino.", "stageId", "etapa de outro pipeline");
    const responsavel = input.ownerId ?? negocio.ownerId;
    if (!destino.members.some((m) => m.userId === responsavel)) {
      throw invalido("O responsável atual não está na equipe do pipeline de destino. Escolha outro.", "ownerId", "fora da equipe do destino");
    }
    const etapaDeOrigem = origem.stages.find((e) => e.id === negocio.stageId);

    await this.prisma.$transaction(async (tx) => {
      // Etiquetas são do pipeline: não acompanham o negócio.
      await tx.dealTag.deleteMany({ where: { dealId: id } });
      await tx.deal.update({ where: { id }, data: { pipelineId: destino.id, stageId: etapa.id, ownerId: responsavel, stageEnteredAt: new Date() } });
      await tx.dealHistory.create({
        data: {
          dealId: id,
          kind: "transferred",
          fromStageId: etapaDeOrigem?.id,
          fromStageName: etapaDeOrigem?.name,
          toStageId: etapa.id,
          toStageName: etapa.name,
          fromPipelineName: origem.name,
          toPipelineName: destino.name,
          actorId: principal.id,
        },
      });
      await this.registrar(tx, "commercial.deal.transferred", id, destino.companyId, principal, {
        fromPipelineId: origem.id,
        toPipelineId: destino.id,
        fromCompanyId: origem.companyId,
      });
    });
    return this.ler(id);
  }

  async bulk(input: BulkDealsRequest, principal: AuthPrincipal): Promise<ListDealsResponse> {
    const negocios = await this.prisma.deal.findMany({ where: { id: { in: input.dealIds } }, select: { id: true, pipelineId: true, stageId: true, status: true } });
    const pipelines = new Set(negocios.map((n) => n.pipelineId));
    if (negocios.length !== new Set(input.dealIds).size || pipelines.size !== 1) {
      throw invalido("Selecione negócios de um mesmo pipeline.", "dealIds", "negócios de pipelines diferentes ou inexistentes");
    }
    const pipeline = await this.pipelineVisivel([...pipelines][0]!, principal);
    const { action } = input;

    await this.prisma.$transaction(async (tx) => {
      if (action.type === "owner") {
        this.garantirResponsavel(pipeline, action.ownerId);
        await tx.deal.updateMany({ where: { id: { in: input.dealIds } }, data: { ownerId: action.ownerId } });
      } else if (action.type === "tag") {
        if (!pipeline.tags.some((t) => t.id === action.tagId)) throw invalido("Use só etiquetas deste pipeline.", "tagId", "etiqueta de outro pipeline");
        await tx.dealTag.createMany({ data: input.dealIds.map((dealId) => ({ dealId, tagId: action.tagId })), skipDuplicates: true });
      } else {
        const destino = pipeline.stages.find((e) => e.id === action.stageId);
        if (!destino) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
        // Só os abertos mudam de etapa: ganho e perdido ficam onde foram encerrados.
        const mover = negocios.filter((n) => n.status === "open" && n.stageId !== destino.id);
        const agora = new Date();
        await tx.deal.updateMany({ where: { id: { in: mover.map((n) => n.id) } }, data: { stageId: destino.id, stageEnteredAt: agora } });
        await tx.dealHistory.createMany({
          data: mover.map((n) => ({
            dealId: n.id,
            kind: "stage_changed" as const,
            fromStageId: n.stageId,
            fromStageName: pipeline.stages.find((e) => e.id === n.stageId)?.name,
            toStageId: destino.id,
            toStageName: destino.name,
            actorId: principal.id,
            occurredAt: agora,
          })),
        });
      }
    });

    const linhas = await this.prisma.deal.findMany({ where: { id: { in: input.dealIds } }, include: DO_NEGOCIO });
    return listDealsResponseSchema.parse({ deals: linhas.map(paraNegocio) });
  }

  /** Quem não alcança o pipeline recebe "não encontrado": a existência não vaza. */
  private async pipelineVisivel(id: string, principal: AuthPrincipal): Promise<PipelineDoNegocio> {
    const [pipeline, acesso] = await Promise.all([
      this.prisma.pipeline.findUnique({ where: { id }, include: DO_PIPELINE }),
      lerAcessoComercial(this.prisma, principal.id),
    ]);
    if (!pipeline || !podeVer(acesso, principal.id, pipeline)) throw new NaoEncontrado(PIPELINE_NAO_ENCONTRADO);
    return pipeline;
  }

  private async negocioAberto(id: string, principal: AuthPrincipal) {
    const negocio = await this.prisma.deal.findUnique({ where: { id }, select: { id: true, pipelineId: true, stageId: true, ownerId: true, status: true } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const pipeline = await this.pipelineVisivel(negocio.pipelineId, principal).catch(() => {
      throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    });
    if (negocio.status !== "open") throw new EstadoInvalido(SO_ABERTO);
    return { negocio, pipeline };
  }

  private garantirResponsavel(pipeline: PipelineDoNegocio, ownerId: string): void {
    if (!pipeline.members.some((m) => m.userId === ownerId)) {
      throw invalido("O responsável precisa estar na equipe do pipeline.", "ownerId", "fora da equipe do pipeline");
    }
  }

  private async ler(id: string): Promise<Deal> {
    return paraNegocio(await this.prisma.deal.findUniqueOrThrow({ where: { id }, include: DO_NEGOCIO }));
  }

  private registrar(
    tx: Prisma.TransactionClient,
    evento: NomeDeEventoAuditavel,
    negocioId: string,
    empresa: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName: evento,
      entityType: "deal",
      entityId: negocioId,
      actorType: this.actorType(principal),
      actorId: principal.id,
      companyId: empresa,
      payload: { companyId: empresa, ...payload },
      occurredAt: new Date(),
    });
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}
