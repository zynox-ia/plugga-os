import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type ActorType } from "@prisma/client";
import {
  convertLeadResponseSchema,
  dealClientOptionsResponseSchema,
  dealDetailSchema,
  listDealHistoryResponseSchema,
  listDealsResponseSchema,
  problemasDaConversaoDoLead,
  problemasDoCadastro,
  type BulkDealsRequest,
  type ConvertLeadRequest,
  type ConvertLeadResponse,
  type CreateDealRequest,
  type Deal,
  type DealDetail,
  type DealHistoryValue,
  type ListDealHistoryQuery,
  type ListDealHistoryResponse,
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
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { exigeAtribuicaoComercial, exigeOperacaoComercial, lerAcessoComercial, pessoaElegivelParaPipelines } from "../pipelines/acesso-comercial";
import type { AcessoComercial } from "../pipelines/pipelines.rules";
import { podeVer } from "../pipelines/pipelines.rules";
import { travarPipelines } from "../pipelines/travar-pipelines";
import { lerCampos, lerValores, valoresDoPipeline } from "../pipelines/custom-fields.rules";
import { prepararValores } from "../pipelines/custom-fields.persistence";
import { lerPerfilDeProcesso } from "../pipelines/solar-profile.rules";
import { lerProjetoSolar, prepararProjetoSolar } from "./solar-project.persistence";
import { PrismaService } from "../prisma/prisma.service";
import { NegociosRepository } from "./negocios.repository";
import { foraDe, hojeNoFuso, problemaDaPerda } from "./negocios.rules";

const DO_NEGOCIO = {
  pipeline: { select: { companyId: true, fields: true, processProfile: true } },
  client: { select: { id: true, name: true, ownerId: true } },
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

type PipelineDoNegocio = Prisma.PipelineGetPayload<{ include: typeof DO_PIPELINE }> & { acesso: AcessoComercial };

const NEGOCIO_NAO_ENCONTRADO = "Negócio não encontrado.";
const PIPELINE_NAO_ENCONTRADO = "Pipeline não encontrado.";
const SO_ABERTO = "Este negócio já foi encerrado.";

function paraNegocio(linha: LinhaDeNegocio, acesso: AcessoComercial): DealDetail {
  const cliente = acesso.admin || acesso.podeVerClientes ? linha.client : null;
  return dealDetailSchema.parse({
    ...(lerPerfilDeProcesso(linha.pipeline.processProfile) ? { solarProject: lerProjetoSolar(linha.solarProject) } : {}),
    customFields: valoresDoPipeline(lerCampos(linha.pipeline.fields), lerValores(linha.customFields)),
    id: linha.id,
    version: linha.version,
    lossNote: linha.lossNote,
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
    client: cliente,
    converted: Boolean(linha.clientId),
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
  companyName: string | null;
  landlinePhone: string | null;
  website: string | null;
  mainInterest: string | null;
  jobTitle: string | null;
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

  async get(id: string, principal: AuthPrincipal): Promise<DealDetail> {
    return this.ler(id, principal);
  }

  async history(id: string, query: ListDealHistoryQuery, principal: AuthPrincipal): Promise<ListDealHistoryResponse> {
    await this.negocioVisivel(id, principal);
    if (query.cursor && !await this.prisma.comContexto((tx) => tx.dealHistory.findFirst({ where: { id: query.cursor, dealId: id }, select: { id: true } }))) {
      throw invalido("Atualize o histórico deste negócio.", "cursor", "registro não encontrado neste negócio");
    }
    // O cursor nativo usa a precisão do timestamp no Postgres (microssegundos),
    // sem reconstruir sua posição a partir de Date do JavaScript (milissegundos).
    const linhas = await this.prisma.comContexto((tx) => tx.dealHistory.findMany({
      where: { dealId: id },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
      include: { actor: { select: { id: true, name: true } } },
    }));
    const pagina = linhas.slice(0, query.limit);
    return listDealHistoryResponseSchema.parse({
      entries: pagina.map((linha) => ({
        id: linha.id, kind: linha.kind, occurredAt: linha.occurredAt.toISOString(), actor: linha.actor,
        field: linha.field, before: linha.beforeValue, after: linha.afterValue,
        fromStageName: linha.fromStageName, toStageName: linha.toStageName,
        fromPipelineName: linha.fromPipelineName, toPipelineName: linha.toPipelineName,
        fromPriority: linha.fromPriority, toPriority: linha.toPriority,
      })),
      nextCursor: linhas.length > query.limit ? pagina.at(-1)!.id : null,
    });
  }

  async list(query: ListDealsQuery, principal: AuthPrincipal): Promise<ListDealsResponse> {
    const pipeline = await this.pipelineVisivel(query.pipelineId, principal);
    const linhas = await this.prisma.comContexto((tx) => tx.deal.findMany({
      where: { pipelineId: query.pipelineId, ...(query.status === "all" ? {} : { status: query.status }) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      take: 2000,
      include: DO_NEGOCIO,
    }));
    return listDealsResponseSchema.parse({ deals: linhas.map((linha) => paraNegocio(linha, pipeline.acesso)) });
  }

  async clientOptions(clientId: string, principal: AuthPrincipal): Promise<DealClientOptionsResponse> {
    const acesso = await this.prisma.comContexto((tx) => lerAcessoComercial(tx, principal.id));
    if (!acesso.admin && !acesso.podeVerClientes) throw new AcessoNegado("Sem acesso aos clientes do CRM.");
    const cliente = await this.prisma.comContexto((tx) => tx.client.findUnique({
      where: { id: clientId },
      select: { ownerId: true, contacts: { select: { id: true, name: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
    }));
    if (!cliente) throw new NaoEncontrado("Cliente não encontrado.");
    return dealClientOptionsResponseSchema.parse(cliente);
  }

  async create(input: CreateDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const pipeline = await this.pipelineVisivel(input.pipelineId, principal);
    exigeAtribuicaoComercial(pipeline.acesso, principal.id, input.ownerId);
    const clientId = input.clientId;

    const id = await this.prisma.comContexto(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const atual = await this.pipelineVisivel(pipeline.id, principal, tx);
      const { acesso } = atual;
      exigeAtribuicaoComercial(acesso, principal.id, input.ownerId);
      if (atual.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios novos.");
      const etapa = atual.stages.find((e) => e.id === input.stageId);
      if (!etapa) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
      if (foraDe(input.tagIds, atual.tags.map((t) => t.id)).length > 0) throw invalido("Use só etiquetas deste pipeline.", "tagIds", "etiqueta de outro pipeline");
      if (clientId) {
        if (!acesso.admin && !acesso.podeVerClientes) throw new AcessoNegado("Sem acesso aos clientes do CRM.");
        const cliente = await tx.client.findUnique({ where: { id: clientId }, select: { active: true, ownerId: true } });
        if (!cliente) throw invalido("Escolha um cliente cadastrado.", "clientId", "cliente não encontrado");
        if (!cliente.active) throw invalido("Este cliente está inativo. Reative-o antes de vincular um lead.", "clientId", "cliente inativo");
      }
      await this.garantirResponsavel(tx, input.ownerId);
      const custom = await prepararValores(tx, lerCampos(atual.fields), input.customFields ?? {});
      const dealId = randomUUID();
      const solar = input.solarProject === undefined ? undefined : await prepararProjetoSolar(tx, atual.processProfile, dealId, input.solarProject, null);
      const position = await this.posicaoNaEtapa(tx, etapa.id, undefined, undefined);
      const criado = await tx.deal.create({
        data: {
          id: dealId,
          pipelineId: atual.id,
          stageId: etapa.id,
          position,
          clientId: input.clientId ?? null,
          ownerId: input.ownerId,
          title: input.title,
          priority: input.priority ?? null,
          value: input.value ?? null,
          expectedCloseDate: input.expectedCloseDate ?? null,
          customFields: custom.values,
          ...(solar ? { solarProject: solar.project } : {}),
          createdById: principal.id,
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
          profile: { create: { ...input.lead } },
          history: { create: { kind: "created", toStageId: etapa.id, toStageName: etapa.name, toPipelineName: atual.name, actorId: principal.id } },
        },
        select: { id: true },
      });
      if (custom.changes.length) await tx.dealHistory.createMany({ data: custom.changes.map((change) => ({
        dealId: criado.id, kind: "field_changed", field: change.field,
        beforeValue: Prisma.JsonNull, afterValue: change.after === null ? Prisma.JsonNull : change.after, actorId: principal.id,
      })) });
      if (solar?.changes.length) await tx.dealHistory.createMany({ data: solar.changes.map((change) => ({
        dealId: criado.id, kind: "field_changed", field: change.field,
        beforeValue: change.before === null ? Prisma.JsonNull : change.before,
        afterValue: change.after === null ? Prisma.JsonNull : change.after, actorId: principal.id,
      })) });
      if (input.contact) {
        const contato = await tx.leadContact.create({ data: { ...input.contact, dealId: criado.id, isPrimary: true } });
        await tx.deal.update({ where: { id: criado.id }, data: { leadContactId: contato.id } });
      }
      await this.registrar(tx, "commercial.deal.created", criado.id, atual.companyId, principal, { pipelineId: atual.id, stageId: etapa.id });
      return criado.id;
    });
    return this.ler(id, principal);
  }

  async update(id: string, input: UpdateLeadRequest, principal: AuthPrincipal): Promise<DealDetail> {
    const { pipeline } = await this.negocioVisivel(id, principal);
    return this.prisma.comContexto(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const pipelineAtual = await this.pipelineVisivel(pipeline.id, principal, tx);
      await tx.$queryRaw`SELECT id FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
      // Confere novamente depois do lock: uma transferência ou revogação pode
      // ter acontecido entre a leitura da tela e esta transação.
      const { acesso } = pipelineAtual;
      const negocio = await tx.deal.findUnique({ where: { id }, include: DO_NEGOCIO });
      if (!negocio || !podeVer(acesso)) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      exigeOperacaoComercial(acesso);
      if (negocio.pipelineId !== pipeline.id || (input.version !== undefined && input.version !== negocio.version)) {
        throw new EstadoInvalido("Este negócio foi alterado. Recarregue os dados antes de salvar.");
      }
      if (!negocio.profile) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      const perfilFinal: PerfilDoLead = { ...negocio.profile, ...input.lead };
      const teraContato = input.contact !== undefined ? input.contact !== null : negocio.leadContactId !== null;
      const problemas = problemasDoCadastro({ ...perfilFinal, temContatos: teraContato });
      if (problemas[0]) throw new RequisicaoInvalida(problemas[0].problema, problemas.map((p) => ({ campo: `lead.${p.campo}`, problema: p.problema })));
      const mudancas: { field: string; before: DealHistoryValue; after: DealHistoryValue }[] = [];
      const comparar = (field: string, before: DealHistoryValue, after: DealHistoryValue) => {
        if (JSON.stringify(before) !== JSON.stringify(after)) mudancas.push({ field, before, after });
      };
      const dados: Prisma.DealUncheckedUpdateInput = {};
      if (input.solarProject !== undefined) {
        if (input.version === undefined) throw invalido("Recarregue o negócio e informe a versão antes de editar a ficha.", "version", "versão obrigatória");
        const solar = await prepararProjetoSolar(tx, pipelineAtual.processProfile, id, input.solarProject, negocio.solarProject);
        mudancas.push(...solar.changes);
        dados.solarProject = solar.project;
      }
      let customFieldIds: string[] = [];
      if (input.customFields !== undefined) {
        if (input.version === undefined) throw invalido("Recarregue o negócio e informe a versão antes de editar campos.", "version", "versão obrigatória");
        const before = lerValores(negocio.customFields);
        const custom = await prepararValores(tx, lerCampos(pipelineAtual.fields), input.customFields, before);
        mudancas.push(...custom.changes);
        customFieldIds = custom.changes.map((change) => change.fieldId);
        dados.customFields = { ...before, ...custom.values };
      }
      if (input.title !== undefined) { comparar("title", negocio.title, input.title); dados.title = input.title; }
      if (input.value !== undefined) {
        const valor = input.value === null ? null : new Prisma.Decimal(input.value).toFixed(2);
        comparar("value", negocio.value?.toFixed(2) ?? null, valor); dados.value = valor;
      }
      if (input.expectedCloseDate !== undefined) {
        comparar("expectedCloseDate", negocio.expectedCloseDate, input.expectedCloseDate); dados.expectedCloseDate = input.expectedCloseDate;
      }
      if (input.ownerId !== undefined && input.ownerId !== negocio.ownerId) {
        exigeAtribuicaoComercial(acesso, principal.id, input.ownerId);
        await this.garantirResponsavel(tx, input.ownerId);
        const responsavel = await tx.user.findUniqueOrThrow({ where: { id: input.ownerId }, select: { id: true, name: true } });
        // Renomear uma pessoa não altera o responsável do negócio.
        if (negocio.ownerId !== responsavel.id) comparar("ownerId", negocio.owner, responsavel);
        dados.ownerId = input.ownerId;
      }
      for (const campo of Object.keys(input.lead ?? {}) as Array<keyof NonNullable<UpdateLeadRequest["lead"]>>) {
        if (input.lead?.[campo] !== undefined) comparar(`lead.${campo}`, negocio.profile[campo], perfilFinal[campo]);
      }
      if (input.tagIds !== undefined) {
        const etiquetas = await tx.pipelineTag.findMany({ where: { pipelineId: pipeline.id }, select: { id: true, name: true } });
        if (foraDe(input.tagIds, etiquetas.map((t) => t.id)).length > 0) throw invalido("Use só etiquetas deste pipeline.", "tagIds", "etiqueta de outro pipeline");
        const antes = negocio.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })).sort((a, b) => a.id.localeCompare(b.id));
        const depois = etiquetas.filter((t) => input.tagIds!.includes(t.id)).sort((a, b) => a.id.localeCompare(b.id));
        if (antes.map((t) => t.id).join() !== depois.map((t) => t.id).join()) comparar("tagIds", antes, depois);
      }
      const camposContato = ["name", "jobTitle", "role", "phone", "phoneIsWhatsapp", "email", "isPrimary", "cpf", "rg"] as const;
      if (input.contact !== undefined) {
        for (const campo of camposContato) {
          const antes = negocio.leadContact?.[campo] ?? null;
          const informado = input.contact?.[campo];
          const depois = input.contact === null ? null : informado !== undefined ? informado : negocio.leadContact?.[campo] ?? (campo === "isPrimary" ? true : campo === "phoneIsWhatsapp" ? false : null);
          comparar(`contact.${campo}`, antes, depois);
        }
      }
      if (mudancas.length === 0 && !(input.solarProject !== undefined && negocio.solarProject === null)) return paraNegocio(negocio, acesso);
      if (input.lead && mudancas.some((m) => m.field.startsWith("lead."))) await tx.leadProfile.update({ where: { dealId: id }, data: input.lead });
      if (mudancas.some((m) => m.field.startsWith("contact."))) {
        if (input.contact === null) dados.leadContactId = null;
        else if (input.contact) {
          if (negocio.leadContactId) {
            await tx.leadContact.update({ where: { id: negocio.leadContactId, dealId: id }, data: input.contact });
          } else {
            const criado = await tx.leadContact.create({ data: { ...input.contact, dealId: id, isPrimary: input.contact.isPrimary ?? true } });
            dados.leadContactId = criado.id;
          }
        }
      }
      if (mudancas.some((m) => m.field === "tagIds")) {
        await tx.dealTag.deleteMany({ where: { dealId: id } });
        await tx.dealTag.createMany({ data: input.tagIds!.map((tagId) => ({ dealId: id, tagId })) });
      }
      // Perfil, contato e etiquetas são tabelas filhas: tocar Deal garante que
      // sua versão também cubra essas alterações, uma só vez por edição.
      await tx.deal.update({ where: { id }, data: { ...dados, updatedAt: new Date() } });
      await tx.dealHistory.createMany({ data: mudancas.map((m) => ({
        dealId: id, kind: "field_changed", field: m.field,
        beforeValue: m.before === null ? Prisma.JsonNull : m.before,
        afterValue: m.after === null ? Prisma.JsonNull : m.after,
        actorId: principal.id,
      })) });
      await this.registrar(tx, "commercial.deal.updated", id, pipelineAtual.companyId, principal, {
        campos: mudancas.filter((m) => !m.field.startsWith("custom:")).map((m) => m.field), customFieldIds,
      });
      return paraNegocio(await tx.deal.findUniqueOrThrow({ where: { id }, include: DO_NEGOCIO }), acesso);
    });
  }

  async convert(id: string, input: ConvertLeadRequest, principal: AuthPrincipal): Promise<ConvertLeadResponse> {
    const { pipeline } = await this.negocioVisivel(id, principal);
    const resultado = await this.comRetentativaDeDocumento(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const pipelineAtual = await this.pipelineVisivel(pipeline.id, principal, tx);
      await tx.$queryRaw`SELECT id FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
      const negocio = await tx.deal.findUnique({ where: { id }, select: { id: true, pipelineId: true, stageId: true, status: true, ownerId: true } });
      const { acesso } = pipelineAtual;
      if (!negocio || !podeVer(acesso)) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      exigeOperacaoComercial(acesso);
      if (negocio.pipelineId !== pipeline.id) throw new EstadoInvalido("O negócio mudou de pipeline. Atualize a tela.");
      if (negocio.status === "lost") throw new EstadoInvalido("Um negócio perdido não pode ser convertido em cliente.");

      const cliente = await this.converterDentro(tx, id, input.resolution, principal);
      if (negocio.status === "open") await this.ganharDentro(tx, negocio, pipelineAtual, principal);
      return cliente;
    });
    return convertLeadResponseSchema.parse({ lead: await this.ler(id, principal), client: resultado ? { id: resultado.id, name: resultado.name } : null, created: resultado?.created ?? null });
  }

  async moveStage(id: string, input: MoveDealStageRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);

    await this.prisma.comContexto(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const pipelineAtual = await this.pipelineVisivel(pipeline.id, principal, tx);
      const destino = pipelineAtual.stages.find((e) => e.id === input.stageId);
      if (!destino) throw invalido("Escolha uma etapa deste pipeline.", "stageId", "etapa de outro pipeline");
      const atual = await this.negocioAtual(tx, id, pipeline.id, principal);
      if (atual.stageId === destino.id && input.beforeDealId === undefined) return;
      const position = await this.posicaoNaEtapa(tx, destino.id, id, input.beforeDealId);
      const mudouEtapa = atual.stageId !== destino.id;
      await tx.deal.update({ where: { id }, data: { stageId: destino.id, position, ...(mudouEtapa ? { stageEnteredAt: new Date() } : {}) } });
      if (mudouEtapa) {
        const origem = pipelineAtual.stages.find((e) => e.id === atual.stageId);
        await tx.dealHistory.create({
          data: { dealId: id, kind: "stage_changed", fromStageId: origem?.id, fromStageName: origem?.name, toStageId: destino.id, toStageName: destino.name, actorId: principal.id },
        });
      }
    });
    return this.ler(id, principal);
  }

  async setPriority(id: string, input: SetDealPriorityRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);
    await this.prisma.comContexto(async (tx) => {
      const [atual] = await tx.$queryRaw<Array<{ priority: SetDealPriorityRequest["priority"]; status: string }>>`SELECT priority, status FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
      if (!atual) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      await this.negocioAtual(tx, id, pipeline.id, principal);
      if (atual.status !== "open") throw new EstadoInvalido(SO_ABERTO);
      if (atual.priority === input.priority) return;
      await tx.deal.update({ where: { id }, data: { priority: input.priority } });
      await tx.dealHistory.create({ data: { dealId: id, kind: "priority_changed", fromPriority: atual.priority, toPriority: input.priority, actorId: principal.id } });
    });
    return this.ler(id, principal);
  }

  async win(id: string, input: WinDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);
    await this.comRetentativaDeDocumento(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const pipelineAtual = await this.pipelineVisivel(pipeline.id, principal, tx);
      const negocio = await this.negocioAtual(tx, id, pipeline.id, principal);
      await this.ganharDentro(tx, negocio, pipelineAtual, principal);
      if (input.convertToClient) await this.converterDentro(tx, id, undefined, principal);
    });
    return this.ler(id, principal);
  }

  async lose(id: string, input: LoseDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline } = await this.negocioAberto(id, principal);

    await this.prisma.comContexto(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const pipelineAtual = await this.pipelineVisivel(pipeline.id, principal, tx);
      const motivo = pipelineAtual.lossReasons.find((m) => m.id === input.lossReasonId) ?? null;
      const problema = problemaDaPerda(motivo, input.revisitOn, hojeNoFuso());
      if (problema) throw new RequisicaoInvalida("Confira o motivo da perda.", [problema]);
      const negocio = await this.negocioAtual(tx, id, pipeline.id, principal);
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
      await this.registrar(tx, "commercial.deal.lost", id, pipelineAtual.companyId, principal, { pipelineId: pipeline.id, lossReasonId: motivo!.id });
    });
    return this.ler(id, principal);
  }

  async transfer(id: string, input: TransferDealRequest, principal: AuthPrincipal): Promise<Deal> {
    const { pipeline: origem } = await this.negocioAberto(id, principal);
    if (input.pipelineId === origem.id) throw invalido("Escolha outro pipeline.", "pipelineId", "o negócio já está neste pipeline");
    const destino = await this.pipelineVisivel(input.pipelineId, principal);

    await this.comRetentativaDeDocumento(async (tx) => {
      await travarPipelines(tx, [origem.id, destino.id]);
      const [origemAtual, destinoAtual] = await Promise.all([
        this.pipelineVisivel(origem.id, principal, tx), this.pipelineVisivel(destino.id, principal, tx),
      ]);
      if (destinoAtual.archivedAt) throw new EstadoInvalido("Pipeline arquivado não recebe negócios.");
      const etapa = destinoAtual.stages.find((e) => e.id === input.stageId);
      if (!etapa) throw invalido("Escolha uma etapa do pipeline de destino.", "stageId", "etapa de outro pipeline");
      const atual = await this.negocioAtual(tx, id, origem.id, principal);
      const responsavel = input.ownerId ?? atual.ownerId;
      if (responsavel !== atual.ownerId) {
        exigeAtribuicaoComercial(destinoAtual.acesso, principal.id, responsavel);
        await this.garantirResponsavel(tx, responsavel);
      }
      const etapaDeOrigem = origemAtual.stages.find((e) => e.id === atual.stageId);
      const position = await this.posicaoNaEtapa(tx, etapa.id, id, undefined);
      // Etiquetas são do pipeline: não acompanham o negócio.
      await tx.dealTag.deleteMany({ where: { dealId: id } });
      await tx.deal.update({ where: { id }, data: { pipelineId: destino.id, stageId: etapa.id, ownerId: responsavel, position, stageEnteredAt: new Date() } });
      await tx.dealHistory.create({
        data: {
          dealId: id,
          kind: "transferred",
          fromStageId: etapaDeOrigem?.id,
          fromStageName: etapaDeOrigem?.name,
          toStageId: etapa.id,
          toStageName: etapa.name,
          fromPipelineName: origemAtual.name,
          toPipelineName: destinoAtual.name,
          actorId: principal.id,
        },
      });
      await this.registrar(tx, "commercial.deal.transferred", id, destinoAtual.companyId, principal, {
        fromPipelineId: origem.id,
        toPipelineId: destino.id,
        fromCompanyId: origemAtual.companyId,
      });
      if (input.convertToClient) {
        await this.converterDentro(tx, id, undefined, principal);
        await this.ganharDentro(tx, { id, stageId: etapa.id }, destinoAtual, principal);
      }
    });
    return this.ler(id, principal);
  }

  async bulk(input: BulkDealsRequest, principal: AuthPrincipal): Promise<ListDealsResponse> {
    const acesso = await this.prisma.comContexto((tx) => lerAcessoComercial(tx, principal.id));
    const negocios = await this.prisma.comContexto((tx) => tx.deal.findMany({ where: { id: { in: input.dealIds } }, select: { id: true, pipelineId: true, stageId: true, status: true, ownerId: true } }));
    if (!podeVer(acesso) || negocios.length !== new Set(input.dealIds).size) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    exigeOperacaoComercial(acesso);
    const pipelines = new Set(negocios.map((n) => n.pipelineId));
    if (negocios.length !== new Set(input.dealIds).size || pipelines.size !== 1) {
      throw invalido("Selecione negócios de um mesmo pipeline.", "dealIds", "negócios de pipelines diferentes ou inexistentes");
    }
    const pipeline = await this.pipelineVisivel([...pipelines][0]!, principal);
    const { action } = input;

    await this.prisma.comContexto(async (tx) => {
      await travarPipelines(tx, [pipeline.id]);
      const pipelineAtual = await this.pipelineVisivel(pipeline.id, principal, tx);
      // Valida o lote inteiro depois dos locks, antes da primeira escrita.
      for (const id of [...new Set(input.dealIds)].sort()) await tx.$queryRaw`SELECT id FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
      const acessoAtual = pipelineAtual.acesso;
      const donos = await tx.deal.findMany({ where: { id: { in: input.dealIds }, pipelineId: pipeline.id }, select: { id: true, ownerId: true } });
      if (donos.length !== new Set(input.dealIds).size) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      exigeOperacaoComercial(acessoAtual);
      if (action.type === "owner") {
        exigeAtribuicaoComercial(acessoAtual, principal.id, action.ownerId);
        await this.garantirResponsavel(tx, action.ownerId);
        const atuais = await tx.deal.findMany({ where: { id: { in: input.dealIds }, pipelineId: pipeline.id }, include: { owner: { select: { id: true, name: true } } } });
        if (atuais.length !== new Set(input.dealIds).size) throw new EstadoInvalido("Um negócio mudou de pipeline. Atualize a tela.");
        const responsavel = await tx.user.findUniqueOrThrow({ where: { id: action.ownerId }, select: { id: true, name: true } });
        for (const atual of atuais.filter((n) => n.ownerId !== action.ownerId)) {
          await tx.deal.update({ where: { id: atual.id }, data: { ownerId: action.ownerId } });
          await tx.dealHistory.create({ data: { dealId: atual.id, kind: "field_changed", field: "ownerId", beforeValue: atual.owner, afterValue: responsavel, actorId: principal.id } });
          await this.registrar(tx, "commercial.deal.updated", atual.id, pipelineAtual.companyId, principal, { campos: ["ownerId"] });
        }
      } else if (action.type === "tag") {
        const tag = await tx.pipelineTag.findFirst({ where: { id: action.tagId, pipelineId: pipeline.id }, select: { id: true, name: true } });
        if (!tag) throw invalido("Use só etiquetas deste pipeline.", "tagId", "etiqueta de outro pipeline");
        const atuais = await tx.deal.findMany({ where: { id: { in: input.dealIds }, pipelineId: pipeline.id }, include: { tags: { include: { tag: { select: { id: true, name: true } } } } } });
        if (atuais.length !== new Set(input.dealIds).size) throw new EstadoInvalido("Um negócio mudou de pipeline. Atualize a tela.");
        for (const atual of atuais.filter((n) => !n.tags.some((t) => t.tagId === action.tagId))) {
          const antes = atual.tags.map((t) => t.tag).sort((a, b) => a.id.localeCompare(b.id));
          const depois = [...antes, tag].sort((a, b) => a.id.localeCompare(b.id));
          await tx.dealTag.create({ data: { dealId: atual.id, tagId: tag.id } });
          await tx.deal.update({ where: { id: atual.id }, data: { updatedAt: new Date() } });
          await tx.dealHistory.create({ data: { dealId: atual.id, kind: "field_changed", field: "tagIds", beforeValue: antes, afterValue: depois, actorId: principal.id } });
          await this.registrar(tx, "commercial.deal.updated", atual.id, pipelineAtual.companyId, principal, { campos: ["tagIds"] });
        }
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
        const destino = pipelineAtual.stages.find((e) => e.id === action.stageId);
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
            fromStageName: pipelineAtual.stages.find((e) => e.id === n.stageId)?.name,
            toStageId: destino.id,
            toStageName: destino.name,
            actorId: principal.id,
            occurredAt: agora,
          })),
        });
      }
    });

    const acessoFinal = await this.prisma.comContexto((tx) => lerAcessoComercial(tx, principal.id));
    if (!podeVer(acessoFinal)) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const linhas = await this.prisma.comContexto((tx) => tx.deal.findMany({ where: { id: { in: input.dealIds } }, include: DO_NEGOCIO }));
    return listDealsResponseSchema.parse({ deals: linhas.map((linha) => paraNegocio(linha, acessoFinal)) });
  }

  private async ganharDentro(
    tx: Prisma.TransactionClient,
    negocio: { id: string; stageId: string },
    pipeline: { id: string; companyId: string },
    principal: AuthPrincipal,
  ): Promise<void> {
    await tx.deal.update({ where: { id: negocio.id }, data: { status: "won", closedAt: new Date() } });
    await tx.dealHistory.create({ data: { dealId: negocio.id, kind: "won", fromStageId: negocio.stageId, actorId: principal.id } });
    await this.registrar(tx, "commercial.deal.won", negocio.id, pipeline.companyId, principal, { pipelineId: pipeline.id });
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
  ): Promise<{ id: string; name: string; created: boolean } | null> {
    const negocio = await tx.deal.findUnique({ where: { id }, select: { clientId: true, ownerId: true, pipeline: { select: { companyId: true } } } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const acesso = await lerAcessoComercial(tx, principal.id);
    exigeOperacaoComercial(acesso);
    if (!acesso.admin && !acesso.podeVerClientes) {
      if (resolution) throw new AcessoNegado("A seleção de cadastro exige acesso a Clientes.");
      if (!negocio.clientId) {
        const perfil = await tx.leadProfile.findUnique({ where: { dealId: id } });
        if (!perfil) throw new EstadoInvalido("Este negócio não tem dados de lead.");
        const totalContatos = await tx.leadContact.count({ where: { dealId: id } });
        const problemas = problemasDaConversaoDoLead({ ...perfil, temContatos: totalContatos > 0 });
        if (problemas[0]) throw new RequisicaoInvalida(problemas[0].problema, problemas.map((p) => ({ campo: `lead.${p.campo}`, problema: p.problema })));
      }
      try {
        await tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${id}::uuid)`;
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2010" && erro.meta?.code === "22023") {
          throw new RequisicaoInvalida("A conversão precisa de uma validação de cadastro. Peça a alguém com acesso a Clientes para concluí-la.");
        }
        throw erro;
      }
      return null;
    }
    if (negocio.clientId) {
      const cliente = await this.clienteVisivel(tx, negocio.clientId, acesso);
      return { id: cliente.id, name: cliente.name, created: false };
    }

    const perfil = await tx.leadProfile.findUnique({ where: { dealId: id } });
    if (!perfil) throw new EstadoInvalido("Este negócio não tem dados de lead.");
    const totalContatos = await tx.leadContact.count({ where: { dealId: id } });
    const problemas = problemasDaConversaoDoLead({ ...perfil, temContatos: totalContatos > 0 });
    if (problemas[0]) throw new RequisicaoInvalida(problemas[0].problema, problemas.map((p) => ({ campo: `lead.${p.campo}`, problema: p.problema })));

    if (perfil.document) {
      const existente = await tx.client.findUnique({ where: { document: perfil.document }, select: { id: true, name: true, ownerId: true } });
      if (existente) {
        return this.vincularCliente(tx, id, existente, principal, negocio.pipeline.companyId);
      }
      return this.criarClienteDoLead(tx, id);
    }

    if (resolution?.type === "link") {
      const existente = await this.clienteVisivel(tx, resolution.clientId, acesso);
      return this.vincularCliente(tx, id, existente, principal, negocio.pipeline.companyId);
    }
    if (resolution?.type === "create") return this.criarClienteDoLead(tx, id);

    const { candidates } = await this.clientes.duplicateCandidates({ name: perfil.name, phone: perfil.phone ?? undefined, email: perfil.email ?? undefined }, principal);
    if (candidates.length > 0) {
      throw new RequisicaoInvalida("Encontramos possíveis duplicatas. Escolha vincular a um deles ou criar um cliente novo.", undefined, { candidatos: candidates });
    }
    return this.criarClienteDoLead(tx, id);
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
  ): Promise<{ id: string; name: string; created: boolean }> {
    // Mesma RPC de um único ID: ator, responsável e dados vêm do contexto/snapshot.
    // A confirmação de candidatos para Clientes permanece em converterDentro.
    const [resultado] = await tx.$queryRaw<{ created: boolean | null }[]>`
      SELECT plugga_security.converter_lead_snapshot(${id}::uuid) AS created`;
    if (typeof resultado?.created !== "boolean") throw new AcessoNegado("Sem acesso aos clientes do CRM.");
    const convertido = await tx.deal.findUnique({ where: { id }, select: { client: { select: { id: true, name: true } } } });
    if (!convertido?.client) throw new EstadoInvalido("O cadastro convertido não está disponível. Atualize o lead.");
    return { ...convertido.client, created: resultado.created };
  }

  /** Duas conversões simultâneas com o mesmo documento: a segunda refaz do zero e enxerga o cliente que a primeira criou. */
  private async comRetentativaDeDocumento<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        return await this.prisma.comContexto((tx) => fn(tx));
      } catch (erro) {
        if (tentativa === 0 && erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") continue;
        throw erro;
      }
    }
    throw new Error("inalcançável");
  }

  private async negocioAtual(tx: Prisma.TransactionClient, id: string, pipelineId: string, principal: AuthPrincipal) {
    await tx.$queryRaw`SELECT id FROM deals WHERE id = ${id}::uuid FOR UPDATE`;
    const atual = await tx.deal.findUnique({ where: { id }, select: { id: true, pipelineId: true, stageId: true, status: true, ownerId: true } });
    if (!atual) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    exigeOperacaoComercial(await lerAcessoComercial(tx, principal.id));
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
  private async pipelineVisivel(id: string, principal: AuthPrincipal, tx?: Prisma.TransactionClient): Promise<PipelineDoNegocio> {
    if (!tx) return this.prisma.comContexto((banco) => this.pipelineVisivel(id, principal, banco));
    const [pipeline, acesso] = await Promise.all([
      tx.pipeline.findUnique({ where: { id }, include: DO_PIPELINE }),
      lerAcessoComercial(tx, principal.id),
    ]);
    if (!pipeline || !podeVer(acesso)) throw new NaoEncontrado(PIPELINE_NAO_ENCONTRADO);
    return { ...pipeline, acesso };
  }

  private async negocioAberto(id: string, principal: AuthPrincipal) {
    const { negocio, pipeline } = await this.negocioVisivel(id, principal);
    if (negocio.status !== "open") throw new EstadoInvalido(SO_ABERTO);
    return { negocio, pipeline };
  }

  /** Visível a quem alcança o pipeline, independente do negócio estar aberto, ganho ou perdido. */
  private async negocioVisivel(id: string, principal: AuthPrincipal) {
    return this.prisma.comContexto(async (tx) => {
    const negocio = await tx.deal.findUnique({ where: { id }, select: { id: true, pipelineId: true, stageId: true, ownerId: true, status: true } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const pipeline = await this.pipelineVisivel(negocio.pipelineId, principal, tx).catch((erro: unknown) => {
      if (erro instanceof NaoEncontrado) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
      throw erro;
    });
    exigeOperacaoComercial(pipeline.acesso);
    return { negocio, pipeline };
    });
  }

  private async clienteVisivel(tx: Prisma.TransactionClient, id: string, acesso: AcessoComercial) {
    if (!acesso.admin && !acesso.podeVerClientes) throw new AcessoNegado("Sem acesso aos clientes do CRM.");
    const cliente = await tx.client.findUnique({ where: { id }, select: { id: true, name: true, ownerId: true } });
    if (!cliente) throw new NaoEncontrado("Cliente não encontrado.");
    return cliente;
  }

  private async garantirResponsavel(tx: Prisma.TransactionClient, ownerId: string): Promise<void> {
    const pessoa = await tx.user.findFirst({ where: { id: ownerId, ...pessoaElegivelParaPipelines }, select: { id: true } });
    if (!pessoa) throw invalido("Escolha uma pessoa ativa com acesso aos pipelines do CRM.", "ownerId", "pessoa inativa ou sem acesso ao CRM/Pipelines");
  }

  private async ler(id: string, principal: AuthPrincipal): Promise<DealDetail> {
    return this.prisma.comContexto(async (tx) => {
    const { pipeline } = await this.negocioVisivel(id, principal);
    const negocio = await tx.deal.findUnique({ where: { id }, include: DO_NEGOCIO });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    return paraNegocio(negocio, pipeline.acesso);
    });
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
    return principal.kind === "user" ? "user" : "agent";
  }
}
