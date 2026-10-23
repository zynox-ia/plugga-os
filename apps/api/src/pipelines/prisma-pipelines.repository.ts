import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ActorType } from "@prisma/client";
import {
  companyKeys,
  listPipelinesResponseSchema,
  pipelinePeopleResponseSchema,
  pipelineSchema,
  type CompanyKey,
  type CreatePipelineRequest,
  type ListPipelinesResponse,
  type NomeDeEventoAuditavel,
  type Pipeline,
  type PipelineMemberInput,
  type PipelinePeopleQuery,
  type PipelinePeopleResponse,
  type UpdatePipelineRequest,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { lerAcessoComercial } from "./acesso-comercial";
import { PipelinesRepository } from "./pipelines.repository";
import {
  alteracoes,
  idsDesconhecidos,
  idsRemovidos,
  podeConfigurar,
  podeCriarEm,
  podeVer,
  problemasDosDestinos,
  trocaEmpresaComNegocios,
  type AcessoComercial,
} from "./pipelines.rules";

const COMPLETO = {
  stages: { orderBy: { position: "asc" }, include: { _count: { select: { deals: true } } } },
  tags: { orderBy: { position: "asc" } },
  lossReasons: { orderBy: { position: "asc" } },
  members: { include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } },
  updatedBy: { select: { id: true, name: true } },
  _count: { select: { deals: true } },
} satisfies Prisma.PipelineInclude;

type LinhaDePipeline = Prisma.PipelineGetPayload<{ include: typeof COMPLETO }>;

const NAO_ENCONTRADO = "Pipeline não encontrado.";
const NOME_REPETIDO = "Já existe um pipeline com este nome nesta empresa.";
const PAPEL_DE_EQUIPE = "comercial";
const VERSAO_DESATUALIZADA = "Outra pessoa alterou este pipeline enquanto você editava. Reabra para ver a versão atual.";

function paraPipeline(linha: LinhaDePipeline, canConfigure: boolean): Pipeline {
  return pipelineSchema.parse({
    id: linha.id,
    companyId: linha.companyId,
    name: linha.name,
    description: linha.description,
    valueLabel: linha.valueLabel,
    color: linha.color,
    wonLabel: linha.wonLabel,
    lostLabel: linha.lostLabel,
    archivedAt: linha.archivedAt?.toISOString() ?? null,
    updatedAt: linha.updatedAt.toISOString(),
    updatedBy: linha.updatedBy,
    stages: linha.stages.map(({ id, name, color, position, staleAfterDays, _count }) => ({
      id,
      name,
      color,
      position,
      staleAfterDays,
      dealCount: _count.deals,
    })),
    tags: linha.tags.map(({ id, name, color }) => ({ id, name, color })),
    lossReasons: linha.lossReasons.map(({ id, name, asksRevisitDate }) => ({ id, name, asksRevisitDate })),
    members: linha.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
    dealCount: linha._count.deals,
    canConfigure,
  });
}

const comPosicao = <T>(itens: readonly T[]) => itens.map((item, position) => ({ ...item, position }));

@Injectable()
export class PrismaPipelinesRepository extends PipelinesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {
    super();
  }

  async list(principal: AuthPrincipal): Promise<ListPipelinesResponse> {
    const acesso = await this.acessoDe(principal.id);
    const where: Prisma.PipelineWhereInput = acesso.admin
      ? {}
      : { OR: [{ companyId: { in: [...acesso.gestorEm] } }, { members: { some: { userId: principal.id } } }] };
    const linhas = await this.prisma.pipeline.findMany({ where, orderBy: { createdAt: "asc" }, include: COMPLETO });
    return listPipelinesResponseSchema.parse({
      pipelines: linhas.map((linha) => paraPipeline(linha, podeConfigurar(acesso, principal.id, linha))),
      canCreateIn: companyKeys.filter((empresa) => podeCriarEm(acesso, empresa)),
    });
  }

  async people(query: PipelinePeopleQuery, principal: AuthPrincipal): Promise<PipelinePeopleResponse> {
    const acesso = await this.acessoDe(principal.id);
    if (!podeCriarEm(acesso, query.companyId)) {
      const gestorDeAlgum = await this.prisma.pipelineMember.findFirst({
        where: { userId: principal.id, role: "gestor", pipeline: { companyId: query.companyId } },
        select: { userId: true },
      });
      if (!gestorDeAlgum) throw new AcessoNegado("Só quem configura pipelines da empresa vê a equipe comercial dela.");
    }
    const pessoas = await this.prisma.user.findMany({
      where: this.elegivelParaEquipe(query.companyId),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return pipelinePeopleResponseSchema.parse({ people: pessoas });
  }

  async create(input: CreatePipelineRequest, principal: AuthPrincipal): Promise<Pipeline> {
    const acesso = await this.acessoDe(principal.id);
    if (!podeCriarEm(acesso, input.companyId)) throw new AcessoNegado("Só o gestor comercial da empresa cria pipelines.");
    await this.garantirNomeLivre(input.companyId, input.name);
    await this.garantirEquipe(input.companyId, input.members);

    const { stages, tags, lossReasons, members, ...gerais } = input;
    const id = await this.comNomeUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const criado = await tx.pipeline.create({
          data: {
            ...gerais,
            updatedById: principal.id,
            stages: { create: comPosicao(stages.map(({ name, color, staleAfterDays }) => ({ name, color, staleAfterDays }))) },
            tags: { create: comPosicao(tags.map(({ name, color }) => ({ name, color }))) },
            lossReasons: { create: comPosicao(lossReasons.map(({ name, asksRevisitDate }) => ({ name, asksRevisitDate }))) },
            members: { create: members.map(({ userId, role }) => ({ userId, role })) },
          },
          select: { id: true },
        });
        await this.registrar(tx, "commercial.pipeline.created", criado.id, input.companyId, principal, {
          etapas: stages.length,
          etiquetas: tags.length,
          motivosDePerda: lossReasons.length,
          equipe: members.length,
        });
        return criado.id;
      }),
    );
    return this.lerParaQuemPediu(id, principal.id, acesso);
  }

  async update(id: string, input: UpdatePipelineRequest, principal: AuthPrincipal): Promise<Pipeline> {
    const acesso = await this.acessoDe(principal.id);
    const atual = await this.lerVisivel(id, principal.id, acesso);
    if (!atual.canConfigure) throw new AcessoNegado("Só gestores deste pipeline alteram a configuração.");
    // Tela desatualizada recebe o motivo certo antes de qualquer outra checagem (ids de etapas já excluídas, por exemplo).
    if (new Date(input.updatedAt).getTime() !== new Date(atual.updatedAt).getTime()) throw new EstadoInvalido(VERSAO_DESATUALIZADA);
    // Com negócios, ninguém troca a empresa; sem negócios, só quem gere as duas.
    if (trocaEmpresaComNegocios(atual, input.companyId)) {
      throw new RequisicaoInvalida("Este pipeline tem negócios e não muda de empresa. Para levar negócios à outra empresa, mova-os para um pipeline dela.", [
        { campo: "companyId", problema: "pipeline com negócios não muda de empresa" },
      ]);
    }
    if (input.companyId !== atual.companyId && !(podeCriarEm(acesso, atual.companyId) && podeCriarEm(acesso, input.companyId))) {
      throw new AcessoNegado("Só quem é gestor comercial das duas empresas troca a empresa do pipeline.");
    }

    const desconhecidos = [
      ...idsDesconhecidos(atual.stages.map((e) => e.id), input.stages),
      ...idsDesconhecidos(atual.tags.map((e) => e.id), input.tags),
      ...idsDesconhecidos(atual.lossReasons.map((e) => e.id), input.lossReasons),
    ];
    if (desconhecidos.length > 0) throw new RequisicaoInvalida("A configuração enviada não corresponde a este pipeline. Reabra e tente de novo.");
    const semDestino = problemasDosDestinos(atual.stages, input.stages, input.stageDestinations);
    if (semDestino.length > 0) {
      throw new RequisicaoInvalida(semDestino[0]!, semDestino.map((problema) => ({ campo: "stageDestinations", problema })));
    }
    if (input.name.toLocaleLowerCase("pt-BR") !== atual.name.toLocaleLowerCase("pt-BR") || input.companyId !== atual.companyId) {
      await this.garantirNomeLivre(input.companyId, input.name, id);
    }
    await this.garantirEquipe(input.companyId, input.members);

    const { campos, secoes } = alteracoes(atual, input);
    const { stages, tags, lossReasons, members, updatedAt, stageDestinations, ...gerais } = input;
    const removidas = idsRemovidos(atual.stages.map((e) => e.id), stages);
    await this.comNomeUnico(() =>
      this.prisma.$transaction(async (tx) => {
        // Trava otimista: só grava sobre a versão que a tela leu. O banco guarda
        // microssegundos e o ISO da tela só milissegundos, daí o intervalo.
        const lido = new Date(updatedAt);
        const gravado = await tx.pipeline.updateMany({
          where: { id, updatedAt: { gte: lido, lt: new Date(lido.getTime() + 1) } },
          data: { ...gerais, updatedById: principal.id },
        });
        if (gravado.count === 0) throw new EstadoInvalido(VERSAO_DESATUALIZADA);

        // Antes de excluir, os negócios das etapas removidas vão para o destino escolhido.
        for (const etapa of atual.stages.filter((e) => removidas.includes(e.id) && e.dealCount > 0)) {
          const destino = stages.find((e) => e.id === stageDestinations[etapa.id])!;
          const agora = new Date();
          const abertos = await tx.deal.findMany({ where: { stageId: etapa.id, status: "open" }, select: { id: true } });
          await tx.deal.updateMany({ where: { stageId: etapa.id, status: "open" }, data: { stageId: destino.id!, stageEnteredAt: agora } });
          await tx.deal.updateMany({ where: { stageId: etapa.id }, data: { stageId: destino.id! } });
          await tx.dealHistory.createMany({
            data: abertos.map((negocio) => ({
              dealId: negocio.id,
              kind: "stage_changed" as const,
              fromStageId: etapa.id,
              fromStageName: etapa.name,
              toStageId: destino.id!,
              toStageName: destino.name,
              actorId: principal.id,
              occurredAt: agora,
            })),
          });
        }
        await tx.pipelineStage.deleteMany({ where: { pipelineId: id, id: { in: removidas } } });
        for (const [position, { id: etapaId, name, color, staleAfterDays }] of stages.entries()) {
          const dados = { name, color, staleAfterDays, position };
          if (etapaId) await tx.pipelineStage.update({ where: { id: etapaId }, data: dados });
          else await tx.pipelineStage.create({ data: { ...dados, pipelineId: id } });
        }

        await tx.pipelineTag.deleteMany({ where: { pipelineId: id, id: { in: idsRemovidos(atual.tags.map((e) => e.id), tags) } } });
        for (const [position, { id: etiquetaId, name, color }] of tags.entries()) {
          if (etiquetaId) await tx.pipelineTag.update({ where: { id: etiquetaId }, data: { name, color, position } });
          else await tx.pipelineTag.create({ data: { name, color, position, pipelineId: id } });
        }

        await tx.pipelineLossReason.deleteMany({
          where: { pipelineId: id, id: { in: idsRemovidos(atual.lossReasons.map((e) => e.id), lossReasons) } },
        });
        for (const [position, { id: motivoId, name, asksRevisitDate }] of lossReasons.entries()) {
          if (motivoId) await tx.pipelineLossReason.update({ where: { id: motivoId }, data: { name, asksRevisitDate, position } });
          else await tx.pipelineLossReason.create({ data: { name, asksRevisitDate, position, pipelineId: id } });
        }

        await tx.pipelineMember.deleteMany({ where: { pipelineId: id } });
        await tx.pipelineMember.createMany({ data: members.map(({ userId, role }) => ({ pipelineId: id, userId, role })) });

        await this.registrar(tx, "commercial.pipeline.updated", id, input.companyId, principal, { campos, secoes });
      }),
    );
    return this.lerParaQuemPediu(id, principal.id, acesso);
  }

  archive(id: string, principal: AuthPrincipal): Promise<Pipeline> {
    return this.mudarSituacao(id, principal, true);
  }

  restore(id: string, principal: AuthPrincipal): Promise<Pipeline> {
    return this.mudarSituacao(id, principal, false);
  }

  private async mudarSituacao(id: string, principal: AuthPrincipal, arquivar: boolean): Promise<Pipeline> {
    const acesso = await this.acessoDe(principal.id);
    const atual = await this.lerVisivel(id, principal.id, acesso);
    if (!atual.canConfigure) throw new AcessoNegado("Só gestores deste pipeline o arquivam ou reativam.");
    if ((atual.archivedAt !== null) === arquivar) {
      throw new EstadoInvalido(arquivar ? "O pipeline já está arquivado." : "O pipeline já está ativo.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.pipeline.update({ where: { id }, data: { archivedAt: arquivar ? new Date() : null, updatedById: principal.id } });
      await this.registrar(tx, arquivar ? "commercial.pipeline.archived" : "commercial.pipeline.restored", id, atual.companyId, principal, {});
    });
    return this.lerParaQuemPediu(id, principal.id, acesso);
  }

  private acessoDe(pessoaId: string): Promise<AcessoComercial> {
    return lerAcessoComercial(this.prisma, pessoaId);
  }

  /** Quem não alcança o pipeline recebe "não encontrado": a existência não vaza. */
  private async lerVisivel(id: string, pessoaId: string, acesso: AcessoComercial): Promise<Pipeline> {
    const linha = await this.prisma.pipeline.findUnique({ where: { id }, include: COMPLETO });
    if (!linha || !podeVer(acesso, pessoaId, linha)) throw new NaoEncontrado(NAO_ENCONTRADO);
    return paraPipeline(linha, podeConfigurar(acesso, pessoaId, linha));
  }

  private async lerParaQuemPediu(id: string, pessoaId: string, acesso: AcessoComercial): Promise<Pipeline> {
    const linha = await this.prisma.pipeline.findUniqueOrThrow({ where: { id }, include: COMPLETO });
    // Quem acabou de salvar pode ter tirado a si mesmo da equipe: devolve o que gravou, sem poder configurar.
    return paraPipeline(linha, podeConfigurar(acesso, pessoaId, linha));
  }

  private elegivelParaEquipe(empresa: CompanyKey): Prisma.UserWhereInput {
    return { status: "active", memberships: { some: { companyId: empresa, roles: { some: { role: { key: PAPEL_DE_EQUIPE } } } } } };
  }

  private async garantirEquipe(empresa: CompanyKey, membros: readonly PipelineMemberInput[]): Promise<void> {
    if (membros.length === 0) return;
    const ids = membros.map((m) => m.userId);
    const elegiveis = await this.prisma.user.findMany({ where: { id: { in: ids }, ...this.elegivelParaEquipe(empresa) }, select: { id: true } });
    const validos = new Set(elegiveis.map((p) => p.id));
    const detalhes = membros.flatMap((m, i) =>
      validos.has(m.userId) ? [] : [{ campo: `members.${i}.userId`, problema: "sem papel comercial ativo na empresa do pipeline" }],
    );
    if (detalhes.length > 0) {
      throw new RequisicaoInvalida("Só pessoas ativas com papel comercial na empresa do pipeline entram na equipe.", detalhes);
    }
  }

  /** O índice único do banco diferencia maiúsculas; a tela não deve. */
  private async garantirNomeLivre(empresa: CompanyKey, nome: string, exceto?: string): Promise<void> {
    const outro = await this.prisma.pipeline.findFirst({
      where: { companyId: empresa, name: { equals: nome, mode: "insensitive" }, ...(exceto ? { id: { not: exceto } } : {}) },
      select: { id: true },
    });
    if (outro) throw new Conflito(NOME_REPETIDO, [{ campo: "name", problema: "nome já usado nesta empresa" }]);
  }

  /** Corrida entre duas gravações com o mesmo nome: o índice único decide, e a resposta é a mesma da checagem. */
  private async comNomeUnico<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw new Conflito(NOME_REPETIDO);
      throw erro;
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    evento: NomeDeEventoAuditavel,
    pipelineId: string,
    empresa: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName: evento,
      entityType: "pipeline",
      entityId: pipelineId,
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
