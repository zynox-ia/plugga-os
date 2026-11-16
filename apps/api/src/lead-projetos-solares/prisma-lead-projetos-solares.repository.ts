import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  createLeadSolarProjectRequestSchema,
  leadSolarProjectSchema,
  updateLeadSolarProjectRequestSchema,
  type CreateLeadSolarProjectRequest,
  type DealHistoryValue,
  type LeadSolarProject,
  type LeadSolarProjectResponse,
  type ListLeadSolarProjectsResponse,
  type UpdateLeadSolarProjectRequest,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { exigeOperacaoComercial, lerAcessoComercial } from "../pipelines/acesso-comercial";
import { lerPerfilDeProcesso } from "../pipelines/solar-profile.rules";
import { travarPipelines } from "../pipelines/travar-pipelines";
import { aoSalvarQualificacao } from "../processo-solar/automacoes-solar";
import { LeadProjetosSolaresRepository } from "./lead-projetos-solares.repository";

type Banco = Prisma.TransactionClient;
type Dados = Omit<CreateLeadSolarProjectRequest, "version">;
const podeVer = (acesso: { podeOperar: boolean }) => acesso.podeOperar;
const INSTALACAO = { residential: "Residencial", commercial: "Comercial", rural: "Rural" } as const;
/** Atributos registrados no histórico do negócio, na ordem da ficha. */
const ATRIBUTOS = [
  "installationType", "averageConsumptionKwh", "consumerUnit", "beneficiaryUcs", "energyBillDocumentIds",
  "roofType", "availableAreaM2", "estimatedPowerKwp", "estimatedInvestment",
] as const;

@Injectable()
export class PrismaLeadProjetosSolaresRepository extends LeadProjetosSolaresRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender = new AuditAppender(),
  ) {
    super();
  }

  list(dealId: string, principal: AuthPrincipal): Promise<ListLeadSolarProjectsResponse> {
    return this.prisma.comContexto(async (tx) => {
      const deal = await this.visible(tx, dealId, principal);
      this.exigeSolar(deal.pipeline.processProfile);
      return { projects: this.lerLista(deal.solarProjects) };
    });
  }

  create(dealId: string, input: CreateLeadSolarProjectRequest, principal: AuthPrincipal): Promise<LeadSolarProjectResponse> {
    const { version, ...payload } = createLeadSolarProjectRequestSchema.parse(input);
    return this.salvar(dealId, version, principal, (projects) => {
      const agora = new Date().toISOString();
      const project = leadSolarProjectSchema.parse({ id: randomUUID(), ...payload, createdAt: agora, updatedAt: agora });
      return { project, projects: [...projects, project], before: null };
    }, payload);
  }

  update(dealId: string, projectId: string, input: UpdateLeadSolarProjectRequest, principal: AuthPrincipal): Promise<LeadSolarProjectResponse> {
    const { version, ...payload } = updateLeadSolarProjectRequestSchema.parse(input);
    return this.salvar(dealId, version, principal, (projects) => {
      const indice = projects.findIndex((item) => item.id === projectId.toLowerCase());
      if (indice < 0) throw new NaoEncontrado("Projeto não encontrado.");
      const atual = projects[indice]!;
      const project = leadSolarProjectSchema.parse({ ...payload, id: atual.id, createdAt: atual.createdAt, updatedAt: new Date().toISOString() });
      const atualizados = [...projects];
      atualizados[indice] = project;
      return { project, projects: atualizados, before: atual };
    }, payload);
  }

  /**
   * Mesma ordem de travas do executor de transições (pipeline e depois negócio),
   * versão do negócio conferida, histórico por atributo alterado e, na
   * Qualificação, avanço por ação humana na mesma transação.
   */
  private async salvar(
    dealId: string, version: number | undefined, principal: AuthPrincipal,
    alterar: (projects: LeadSolarProject[]) => { project: LeadSolarProject; projects: LeadSolarProject[]; before: LeadSolarProject | null },
    payload: Dados,
  ): Promise<LeadSolarProjectResponse> {
    if (version === undefined) throw new RequisicaoInvalida("Recarregue o lead e informe a versão antes de salvar o projeto.", [{ campo: "version", problema: "versão obrigatória" }]);
    return this.prisma.comContexto(async (tx) => {
      const previa = await tx.deal.findUnique({ where: { id: dealId }, select: { pipelineId: true } });
      if (!previa) throw new NaoEncontrado("Negócio não encontrado.");
      await travarPipelines(tx, [previa.pipelineId]);
      const deal = await this.visible(tx, dealId, principal, true);
      this.exigeSolar(deal.pipeline.processProfile);
      if (deal.version !== version) throw new EstadoInvalido("Este lead foi alterado. Recarregue os dados antes de salvar o projeto.");
      const { project, projects, before } = alterar(this.lerLista(deal.solarProjects));
      // Só a conta nova entra na validação de disponibilidade: uma referência já persistida que
      // ficou indisponível (reclassificada/arquivada) é preservada com aviso (PLU-313), sem travar
      // o salvamento de outras alterações no mesmo projeto.
      const antesIds = new Set(before?.energyBillDocumentIds ?? []);
      const novasContas = payload.energyBillDocumentIds.filter((id) => !antesIds.has(id));
      await this.validarContas(tx, dealId, payload.energyBillDocumentIds, novasContas);
      const agora = new Date();
      await tx.deal.update({ where: { id: dealId }, data: { solarProjects: projects, updatedAt: agora } });
      const changes = await this.mudancas(tx, dealId, before, project);
      if (changes.length) await tx.dealHistory.createMany({ data: changes.map((change) => ({
        dealId, kind: "field_changed", field: change.field,
        beforeValue: change.before === null ? Prisma.JsonNull : change.before,
        afterValue: change.after === null ? Prisma.JsonNull : change.after,
        actorId: principal.id, occurredAt: agora,
      })) });
      const advancedToProposal = await aoSalvarQualificacao(tx, this.auditoria, principal, agora, dealId);
      return { project, advancedToProposal };
    });
  }

  private async mudancas(tx: Banco, dealId: string, before: LeadSolarProject | null, after: LeadSolarProject) {
    const resumo = (project: LeadSolarProject) => `${INSTALACAO[project.installationType]} · UC ${project.consumerUnit}`;
    if (!before) return [{ field: "solar:projeto", before: null, after: { id: after.id, name: resumo(after) } as DealHistoryValue }];
    const contas = [...new Set([...before.energyBillDocumentIds, ...after.energyBillDocumentIds])];
    const nomes = new Map((contas.length ? await tx.leadDocument.findMany({ where: { id: { in: contas }, dealId }, select: { id: true, originalName: true } }) : [])
      .map((doc) => [doc.id, doc.originalName]));
    const valor = (project: LeadSolarProject, key: (typeof ATRIBUTOS)[number]): DealHistoryValue => {
      if (key === "beneficiaryUcs") return project.beneficiaryUcs.map(({ id, code }) => ({ id, name: code }));
      if (key === "energyBillDocumentIds") return project.energyBillDocumentIds.map((id) => ({ id, name: nomes.get(id) ?? id }));
      return project[key] ?? null;
    };
    // O campo leva o projeto: o histórico distingue alterações de projetos diferentes do mesmo lead.
    return ATRIBUTOS.flatMap((key) => JSON.stringify(valor(before, key)) === JSON.stringify(valor(after, key)) ? []
      : [{ field: `solar:projeto:${after.id}:${key}`, before: valor(before, key), after: valor(after, key) }]);
  }

  private lerLista(value: unknown): LeadSolarProject[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => leadSolarProjectSchema.parse(item));
  }

  private exigeSolar(profile: unknown) {
    if (!lerPerfilDeProcesso(profile)) {
      throw new RequisicaoInvalida("Projetos Solar só estão disponíveis em pipelines do processo Solar.");
    }
  }

  /** `ids` é a lista final (duplicidade nunca é aceita); `novos` são só os acrescentados nesta gravação. */
  private async validarContas(tx: Banco, dealId: string, ids: string[], novos: string[]) {
    if (!ids.length) return;
    const unicos = [...new Set(ids)];
    if (unicos.length !== ids.length) {
      throw new RequisicaoInvalida("Remova contas de energia repetidas.", [{ campo: "energyBillDocumentIds", problema: "Remova contas de energia repetidas." }]);
    }
    if (!novos.length) return;
    const unicosNovos = [...new Set(novos)];
    const documentos = await tx.leadDocument.findMany({
      where: { id: { in: unicosNovos }, dealId, category: "conta_de_energia", uploadState: "ready", archivedAt: null },
      select: { id: true },
    });
    if (documentos.length !== unicosNovos.length) {
      throw new RequisicaoInvalida("Selecione contas de energia disponíveis deste negócio.", [{ campo: "energyBillDocumentIds", problema: "Selecione contas de energia disponíveis deste negócio." }]);
    }
  }

  private async visible(tx: Banco, dealId: string, principal: AuthPrincipal, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`;
    const [deal, access] = await Promise.all([
      tx.deal.findUnique({ where: { id: dealId }, include: { pipeline: { select: { processProfile: true } } } }),
      lerAcessoComercial(tx, principal.id),
    ]);
    if (!deal || !podeVer(access)) throw new NaoEncontrado("Negócio não encontrado.");
    exigeOperacaoComercial(access);
    return deal;
  }
}
