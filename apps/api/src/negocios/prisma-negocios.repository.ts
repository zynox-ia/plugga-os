import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ActorType } from "@prisma/client";
import {
  convertLeadResponseSchema,
  dealClientOptionsResponseSchema,
  dealSchema,
  listDealsResponseSchema,
  problemasDoCadastro,
  type BulkDealsRequest,
  type ConvertLeadRequest,
  type ConvertLeadResponse,
  type CreateDealRequest,
  type Deal,
  type DealClientOptionsResponse,
  type ListDealsQuery,
  type ListDealsResponse,
  type LoseDealRequest,
  type MoveDealStageRequest,
  type SetDealPriorityRequest,
  type NomeDeEventoAuditavel,
  type TransferDealRequest,
  type UpdateLeadRequest,
  type WinDealRequest,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { ClientesService } from "../clientes/clientes.service";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { lerAcessoComercial, pessoaElegivelParaPipelines } from "../pipelines/acesso-comercial";
import { podeVer } from "../pipelines/pipelines.rules";
import { PrismaService } from "../prisma/prisma.service";
import { NegociosRepository } from "./negocios.repository";
import { foraDe, hojeNoFuso, problemaDaPerda } from "./negocios.rules";

const DO_NEGOCIO = {
  pipeline: { select: { companyId: true } },
  client: { select: { id: true, name: true } },
  profile: true,
  leadContact: true,
  owner: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true, position: true } } } },
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
    number: linha.number,
    pipelineId: linha.pipelineId,
    companyId: linha.pipeline.companyId,
    stageId: linha.stageId,
    status: linha.status,
    priority: linha.priority,
    title: linha.title,
    value: linha.value?.toFixed(2) ?? null,
    expectedCloseDate: linha.expectedCloseDate,
    lead: linha.profile,
    contact: linha.leadContact
      ? { ...linha.leadContact, createdAt: linha.leadContact.createdAt.toISOString(), updatedAt: linha.leadContact.updatedAt.toISOString() }
      : null,
    client: linha.client,
    owner: linha.owner,
    tags: [...linha.tags].sort((a, b) => a.tag.position - b.tag.position).map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color })),
    stageEnteredAt: linha.stageEnteredAt.toISOString(),
    closedAt: linha.closedAt?.toISOString() ?? null,
    lossReason: linha.lossReasonName,
    revisitOn: linha.revisitOn,
    createdAt: linha.createdAt.toISOString(),
  });
}

const invalido = (mensagem: string, campo: string, problema: string) => new RequisicaoInvalida(mensagem, [{ campo, problema }]);

type PerfilDoLead = {
  personType: "pf" | "pj";
  name: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  street: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  origin: string | null;
  notes: string | null;
};

@Injectable()
export class PrismaNegociosRepository extends NegociosRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
    @Inject(ClientesService) private readonly clientes: ClientesService,
  ) {
    super();
  }

  async list(query: ListDealsQuery, principal: AuthPrincipal): Promise<ListDealsResponse> {
    await this.pipelineVisivel(query.pipelineId, principal);
    const linhas = await this.prisma.deal.findMany({
      where: { pipelineId: query.pipelineId, ...(query.status === "all" ? {} : { status: query.status }) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      take: 2000,
      include: DO_NEGOCIO,
    });
    return listDealsResponseSchema.parse({ deals: linhas.map(paraNegocio) });
  }

  async clientOptions(clientId: string): Promise<DealClientOptionsResponse> {
    const cliente = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { contacts: { select: { id: true, name: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
    });
    if (!cliente) throw new NaoEncontrado("Cliente não encontrado.");
    return dealClientOptionsResponseSchema.parse(cliente);
  }

  async create(input: CreateDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const pipeline = await this.pipelineVisivel(input.pipelineId, principal);
    if (pipeline.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios novos.");
    const etapa = pipeline.stages.find((e) => e.id === input.stageId);
    if (!etapa) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
    if (foraDe(input.tagIds, pipeline.tags.map((t) => t.id)).length > 0) {
      throw invalido("Use só etiquetas deste pipeline.", "tagIds", "etiqueta de outro pipeline");
    }
    if (input.clientId) {
      const cliente = await this.prisma.client.findUnique({ where: { id: input.clientId }, select: { active: true } });
      if (!cliente) throw invalido("Escolha um cliente cadastrado.", "clientId", "cliente não encontrado");
      if (!cliente.active) throw invalido("Este cliente está inativo. Reative-o antes de vincular um lead.", "clientId", "cliente inativo");
    }

    const id = await this.prisma.$transaction(async (tx) => {
      await this.travarPipelines(tx, [pipeline.id]);
      await this.garantirResponsavel(tx, input.ownerId);
      const position = await this.posicaoNaEtapa(tx, etapa.id, undefined, undefined);
      const criado = await tx.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: etapa.id,
          position,
          clientId: input.clientId ?? null,
          ownerId: input.ownerId,
          title: input.title,
          priority: input.priority ?? null,
          value: input.value ?? null,
          expectedCloseDate: input.expectedCloseDate ?? null,
          createdById: principal.id,
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
          profile: { create: { ...input.lead } },
          history: { create: { kind: "created", toStageId: etapa.id, toStageName: etapa.name, toPipelineName: pipeline.name, actorId: principal.id } },
        },
        select: { id: true },
      });
      if (input.contact) {
        const contato = await tx.leadContact.create({ data: { ...input.contact, dealId: criado.id, isPrimary: true } });
        await tx.deal.update({ where: { id: criado.id }, data: { leadContactId: contato.id } });
      }
      await this.registrar(tx, "commercial.deal.created", criado.id, pipeline.companyId, principal, { pipelineId: pipeline.id, stageId: etapa.id });
      return criado.id;
    });
    return this.ler(id);
  }

  async update(id: string, input: UpdateLeadRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioVisivel(id, principal);
    await this.prisma.$transaction(async (tx) => {
      const perfilAtual = await tx.leadProfile.findUnique({ where: { dealId: id } });
      if (!perfilAtual) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      const negocio = await tx.deal.findUniqueOrThrow({ where: { id }, select: { leadContactId: true } });

      const perfilFinal: PerfilDoLead = { ...perfilAtual, ...input.lead };
      const teraContato = input.contact !== undefined ? input.contact !== null : negocio.leadContactId !== null;
      const problemas = problemasDoCadastro({ ...perfilFinal, temContatos: teraContato });
      if (problemas[0]) throw new RequisicaoInvalida(problemas[0].problema, problemas.map((p) => ({ campo: `lead.${p.campo}`, problema: p.problema })));

      if (input.lead) await tx.leadProfile.update({ where: { dealId: id }, data: input.lead });

      if (input.contact === null) {
        await tx.deal.update({ where: { id }, data: { leadContactId: null } });
      } else if (input.contact) {
        if (negocio.leadContactId) {
          await tx.leadContact.update({ where: { id: negocio.leadContactId }, data: input.contact });
        } else {
          const criado = await tx.leadContact.create({ data: { ...input.contact, dealId: id, isPrimary: true } });
          await tx.deal.update({ where: { id }, data: { leadContactId: criado.id } });
        }
      }
      await this.registrar(tx, "commercial.deal.updated", id, pipeline.companyId, principal, {});
    });
    return this.ler(id);
  }

  async convert(id: string, input: ConvertLeadRequest, principal: AuthPrincipal): Promise<ConvertLeadResponse> {
    await this.negocioVisivel(id, principal);
    const resultado = await this.comRetentativaDeDocumento((tx) => this.converterDentro(tx, id, input.resolution, principal));
    return convertLeadResponseSchema.parse({ lead: await this.ler(id), client: { id: resultado.id, name: resultado.name }, created: resultado.created });
  }

  async moveStage(id: string, input: MoveDealStageRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);
    const destino = pipeline.stages.find((e) => e.id === input.stageId);
    if (!destino) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");

    await this.prisma.$transaction(async (tx) => {
      await this.travarPipelines(tx, [pipeline.id]);
      const atual = await this.negocioAtual(tx, id, pipeline.id);
      if (atual.stageId === destino.id && input.beforeDealId === undefined) return;
      const position = await this.posicaoNaEtapa(tx, destino.id, id, input.beforeDealId);
      const mudouEtapa = atual.stageId !== destino.id;
      await tx.deal.update({ where: { id }, data: { stageId: destino.id, position, ...(mudouEtapa ? { stageEnteredAt: new Date() } : {}) } });
      if (mudouEtapa) {
        const origem = pipeline.stages.find((e) => e.id === atual.stageId);
        await tx.dealHistory.create({
          data: { dealId: id, kind: "stage_changed", fromStageId: origem?.id, fromStageName: origem?.name, toStageId: destino.id, toStageName: destino.name, actorId: principal.id },
        });
      }
    });
    return this.ler(id);
  }

  async setPriority(id: string, input: SetDealPriorityRequest, principal: AuthPrincipal): Promise<Deal> {
    await this.negocioAberto(id, principal);
    await this.prisma.$transaction(async (tx) => {
      const [atual] = await tx.$queryRaw<Array<{ priority: SetDealPriorityRequest["priority"]; status: string }>>`SELECT priority, status FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
      if (!atual) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      if (atual.status !== "open") throw new EstadoInvalido(SO_ABERTO);
      if (atual.priority === input.priority) return;
      await tx.deal.update({ where: { id }, data: { priority: input.priority } });
      await tx.dealHistory.create({ data: { dealId: id, kind: "priority_changed", fromPriority: atual.priority, toPriority: input.priority, actorId: principal.id } });
    });
    return this.ler(id);
  }

  async win(id: string, input: WinDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);
    await this.comRetentativaDeDocumento(async (tx) => {
      await this.travarPipelines(tx, [pipeline.id]);
      const negocio = await this.negocioAtual(tx, id, pipeline.id);
      await tx.deal.update({ where: { id }, data: { status: "won", closedAt: new Date() } });
      await tx.dealHistory.create({ data: { dealId: id, kind: "won", fromStageId: negocio.stageId, actorId: principal.id } });
      await this.registrar(tx, "commercial.deal.won", id, pipeline.companyId, principal, { pipelineId: pipeline.id });
      if (input.convertToClient) await this.converterDentro(tx, id, undefined, principal);
    });
    return this.ler(id);
  }

  async lose(id: string, input: LoseDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);
    const motivo = pipeline.lossReasons.find((m) => m.id === input.lossReasonId) ?? null;
    const problema = problemaDaPerda(motivo, input.revisitOn, hojeNoFuso());
    if (problema) throw new RequisicaoInvalida("Confira o motivo da perda.", [problema]);

    await this.prisma.$transaction(async (tx) => {
      await this.travarPipelines(tx, [pipeline.id]);
      const negocio = await this.negocioAtual(tx, id, pipeline.id);
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
    const { pipeline: origem } = await this.negocioAberto(id, principal);
    if (input.pipelineId === origem.id) throw invalido("Escolha outro pipeline.", "pipelineId", "o negócio já está neste pipeline");
    const destino = await this.pipelineVisivel(input.pipelineId, principal);
    if (destino.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios.");
    const etapa = destino.stages.find((e) => e.id === input.stageId);
    if (!etapa) throw invalido("Escolha uma etapa do pipeline de destino.", "stageId", "etapa de outro pipeline");

    await this.comRetentativaDeDocumento(async (tx) => {
      await this.travarPipelines(tx, [origem.id, destino.id]);
      const atual = await this.negocioAtual(tx, id, origem.id);
      const responsavel = input.ownerId ?? atual.ownerId;
      const etapaDeOrigem = origem.stages.find((e) => e.id === atual.stageId);
      const position = await this.posicaoNaEtapa(tx, etapa.id, id, undefined);
      // Etiquetas são do pipeline: não acompanham o negócio.
      await tx.dealTag.deleteMany({ where: { dealId: id } });
      await this.garantirResponsavel(tx, responsavel);
      await tx.deal.update({ where: { id }, data: { pipelineId: destino.id, stageId: etapa.id, ownerId: responsavel, position, stageEnteredAt: new Date() } });
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
      if (input.convertToClient) await this.converterDentro(tx, id, undefined, principal);
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
      await this.travarPipelines(tx, [pipeline.id]);
      if (action.type === "owner") {
        await this.garantirResponsavel(tx, action.ownerId);
        await tx.deal.updateMany({ where: { id: { in: input.dealIds } }, data: { ownerId: action.ownerId } });
      } else if (action.type === "tag") {
        if (!pipeline.tags.some((t) => t.id === action.tagId)) throw invalido("Use só etiquetas deste pipeline.", "tagId", "etiqueta de outro pipeline");
        await tx.dealTag.createMany({ data: input.dealIds.map((dealId) => ({ dealId, tagId: action.tagId })), skipDuplicates: true });
      } else if (action.type === "priority") {
        for (const id of [...new Set(input.dealIds)].sort()) {
          const [atual] = await tx.$queryRaw<Array<{ priority: SetDealPriorityRequest["priority"]; status: string }>>`SELECT priority, status FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
          if (!atual) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
          if (atual.status !== "open") throw new EstadoInvalido(SO_ABERTO);
          if (atual.priority === action.priority) continue;
          await tx.deal.update({ where: { id }, data: { priority: action.priority } });
          await tx.dealHistory.create({ data: { dealId: id, kind: "priority_changed", fromPriority: atual.priority, toPriority: action.priority, actorId: principal.id } });
        }
      } else {
        const destino = pipeline.stages.find((e) => e.id === action.stageId);
        if (!destino) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
        // Só os abertos mudam de etapa: ganho e perdido ficam onde foram encerrados.
        const atuais = await tx.deal.findMany({ where: { id: { in: input.dealIds }, pipelineId: pipeline.id }, orderBy: [{ position: "asc" }, { id: "asc" }] });
        if (atuais.length !== new Set(input.dealIds).size) throw new EstadoInvalido("Um negócio mudou de pipeline. Atualize a tela.");
        const mover = atuais.filter((n) => n.status === "open" && n.stageId !== destino.id);
        const agora = new Date();
        for (const negocio of [...mover].reverse()) {
          const position = await this.posicaoNaEtapa(tx, destino.id, negocio.id, undefined);
          await tx.deal.update({ where: { id: negocio.id }, data: { stageId: destino.id, stageEnteredAt: agora, position } });
        }
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

  /**
   * Vincula a um cliente já cadastrado (documento igual ou escolha explícita) ou
   * cria um cliente novo copiando perfil e contatos do lead. Idempotente: se o
   * negócio já tem cliente, devolve o vínculo existente sem repetir o histórico.
   * Nunca mescla candidatos sozinho: sem documento e sem escolha explícita, quem
   * chama recebe os candidatos (ou os campos obrigatórios que faltam) e nada muda.
   */
  private async converterDentro(
    tx: Prisma.TransactionClient,
    id: string,
    resolution: ConvertLeadRequest["resolution"] | undefined,
    principal: AuthPrincipal,
  ): Promise<{ id: string; name: string; created: boolean }> {
    const negocio = await tx.deal.findUnique({ where: { id }, select: { clientId: true, ownerId: true, pipeline: { select: { companyId: true } } } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    if (negocio.clientId) {
      const cliente = await tx.client.findUniqueOrThrow({ where: { id: negocio.clientId }, select: { id: true, name: true } });
      return { ...cliente, created: false };
    }

    const perfil = await tx.leadProfile.findUnique({ where: { dealId: id } });
    if (!perfil) throw new EstadoInvalido("Este negócio não tem dados de lead.");
    const totalContatos = await tx.leadContact.count({ where: { dealId: id } });
    const problemas = problemasDoCadastro({ ...perfil, temContatos: totalContatos > 0 });
    if (problemas[0]) throw new RequisicaoInvalida(problemas[0].problema, problemas.map((p) => ({ campo: `lead.${p.campo}`, problema: p.problema })));

    if (perfil.document) {
      const existente = await tx.client.findUnique({ where: { document: perfil.document }, select: { id: true, name: true } });
      if (existente) return this.vincularCliente(tx, id, existente, principal, negocio.pipeline.companyId);
      return this.criarClienteDoLead(tx, id, perfil, negocio, principal);
    }

    if (resolution?.type === "link") {
      const existente = await tx.client.findUnique({ where: { id: resolution.clientId }, select: { id: true, name: true } });
      if (!existente) throw invalido("Escolha um cliente cadastrado.", "resolution.clientId", "cliente não encontrado");
      return this.vincularCliente(tx, id, existente, principal, negocio.pipeline.companyId);
    }
    if (resolution?.type === "create") return this.criarClienteDoLead(tx, id, perfil, negocio, principal);

    const { candidates } = await this.clientes.duplicateCandidates({ name: perfil.name, phone: perfil.phone ?? undefined, email: perfil.email ?? undefined });
    if (candidates.length > 0) {
      throw new RequisicaoInvalida("Encontramos possíveis duplicatas. Escolha vincular a um deles ou criar um cliente novo.", undefined, { candidatos: candidates });
    }
    return this.criarClienteDoLead(tx, id, perfil, negocio, principal);
  }

  private async vincularCliente(
    tx: Prisma.TransactionClient,
    id: string,
    cliente: { id: string; name: string },
    principal: AuthPrincipal,
    companyId: string,
  ): Promise<{ id: string; name: string; created: boolean }> {
    await tx.deal.update({ where: { id }, data: { clientId: cliente.id } });
    await tx.dealHistory.create({ data: { dealId: id, kind: "client_converted", actorId: principal.id } });
    await this.registrar(tx, "commercial.deal.client_converted", id, companyId, principal, {});
    return { ...cliente, created: false };
  }

  private async criarClienteDoLead(
    tx: Prisma.TransactionClient,
    id: string,
    perfil: PerfilDoLead,
    negocio: { ownerId: string; pipeline: { companyId: string } },
    principal: AuthPrincipal,
  ): Promise<{ id: string; name: string; created: boolean }> {
    const contatos = await tx.leadContact.findMany({ where: { dealId: id } });
    const cliente = await tx.client.create({
      data: {
        personType: perfil.personType,
        name: perfil.name,
        legalName: perfil.legalName,
        document: perfil.document,
        phone: perfil.phone,
        email: perfil.email,
        postalCode: perfil.postalCode,
        street: perfil.street,
        addressComplement: perfil.addressComplement,
        district: perfil.district,
        city: perfil.city,
        state: perfil.state,
        origin: perfil.origin as Prisma.ClientCreateInput["origin"],
        notes: perfil.notes,
        ownerId: negocio.ownerId,
        contacts: {
          create: contatos.map(({ name, jobTitle, role, phone, phoneIsWhatsapp, email, isPrimary, cpf, rg }) => ({
            name,
            jobTitle,
            role,
            phone,
            phoneIsWhatsapp,
            email,
            isPrimary,
            cpf,
            rg,
          })),
        },
      },
      select: { id: true, name: true },
    });
    await tx.deal.update({ where: { id }, data: { clientId: cliente.id } });
    await tx.dealHistory.create({ data: { dealId: id, kind: "client_converted", actorId: principal.id } });
    await this.registrar(tx, "commercial.deal.client_converted", id, negocio.pipeline.companyId, principal, {});
    return { ...cliente, created: true };
  }

  /** Duas conversões simultâneas com o mesmo documento: a segunda refaz do zero e enxerga o cliente que a primeira criou. */
  private async comRetentativaDeDocumento<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        return await this.prisma.$transaction((tx) => fn(tx));
      } catch (erro) {
        if (tentativa === 0 && erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") continue;
        throw erro;
      }
    }
    throw new Error("inalcançável");
  }

  private async travarPipelines(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    for (const id of [...new Set(ids)].sort()) {
      await tx.$queryRaw`SELECT id FROM pipelines WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }

  private async negocioAtual(tx: Prisma.TransactionClient, id: string, pipelineId: string) {
    const atual = await tx.deal.findUnique({ where: { id }, select: { id: true, pipelineId: true, stageId: true, status: true, ownerId: true } });
    if (!atual) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    if (atual.pipelineId !== pipelineId) throw new EstadoInvalido("O negócio mudou de pipeline. Atualize a tela.");
    if (atual.status !== "open") throw new EstadoInvalido(SO_ABERTO);
    return atual;
  }

  private async posicaoNaEtapa(tx: Prisma.TransactionClient, stageId: string, ignorarId: string | undefined, beforeDealId: string | null | undefined): Promise<Prisma.Decimal> {
    if (beforeDealId && beforeDealId === ignorarId) throw invalido("Escolha outro negócio como referência.", "beforeDealId", "referência inválida");
    const carregar = () => tx.deal.findMany({ where: { stageId, ...(ignorarId ? { id: { not: ignorarId } } : {}) }, select: { id: true, position: true, status: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    let itens = await carregar();
    const calcular = () => {
      const indice = beforeDealId === null ? itens.length : beforeDealId === undefined ? 0 : itens.findIndex((item) => item.id === beforeDealId && item.status === "open");
      if (indice < 0) throw invalido("Escolha um negócio aberto desta etapa.", "beforeDealId", "referência inválida");
      const anterior = itens[indice - 1]?.position;
      const proximo = itens[indice]?.position;
      if (!anterior && !proximo) return new Prisma.Decimal(1024);
      if (!anterior) return proximo!.minus(1024);
      if (!proximo) return anterior.plus(1024);
      return anterior.plus(proximo).dividedBy(2).toDecimalPlaces(10);
    };
    let position = calcular();
    const limite = new Prisma.Decimal("99999999999999999999");
    const colisao = () => itens.some((item) => item.position.equals(position)) || itens.some((item, index) => index > 0 && item.position.equals(itens[index - 1]!.position));
    if (position.abs().greaterThan(limite) || colisao()) {
      for (const [indice, item] of itens.entries()) {
        await tx.deal.update({ where: { id: item.id }, data: { position: new Prisma.Decimal(indice + 1).times(1024) } });
      }
      itens = await carregar();
      position = calcular();
    }
    return position;
  }

  /** Quem não alcança o pipeline recebe "não encontrado": a existência não vaza. */
  private async pipelineVisivel(id: string, principal: AuthPrincipal): Promise<PipelineDoNegocio> {
    const [pipeline, acesso] = await Promise.all([
      this.prisma.pipeline.findUnique({ where: { id }, include: DO_PIPELINE }),
      lerAcessoComercial(this.prisma, principal.id),
    ]);
    if (!pipeline || !podeVer(acesso)) throw new NaoEncontrado(PIPELINE_NAO_ENCONTRADO);
    return pipeline;
  }

  private async negocioAberto(id: string, principal: AuthPrincipal) {
    const { negocio, pipeline } = await this.negocioVisivel(id, principal);
    if (negocio.status !== "open") throw new EstadoInvalido(SO_ABERTO);
    return { negocio, pipeline };
  }

  /** Visível a quem alcança o pipeline, independente do negócio estar aberto, ganho ou perdido. */
  private async negocioVisivel(id: string, principal: AuthPrincipal) {
    const negocio = await this.prisma.deal.findUnique({ where: { id }, select: { id: true, pipelineId: true, stageId: true, ownerId: true, status: true } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const pipeline = await this.pipelineVisivel(negocio.pipelineId, principal).catch(() => {
      throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    });
    return { negocio, pipeline };
  }

  private async garantirResponsavel(tx: Prisma.TransactionClient, ownerId: string): Promise<void> {
    const pessoa = await tx.user.findFirst({ where: { id: ownerId, ...pessoaElegivelParaPipelines }, select: { id: true } });
    if (!pessoa) throw invalido("Escolha uma pessoa ativa com acesso aos pipelines do CRM.", "ownerId", "pessoa inativa ou sem acesso ao CRM/Pipelines");
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
