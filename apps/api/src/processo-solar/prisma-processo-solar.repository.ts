import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  pipelineProcessProfileSchema, solarProcessStateSchema, solarStageRoles,
  type ActivateSolarProcessRequest, type SolarProcessActivation, type SolarProcessState, type SolarStageRole,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { exigeOperacaoComercial, lerAcessoComercial } from "../pipelines/acesso-comercial";
import { podeConfigurar } from "../pipelines/pipelines.rules";
import { lerPerfilDeProcesso } from "../pipelines/solar-profile.rules";
import { travarPipelines } from "../pipelines/travar-pipelines";
import { PrismaService } from "../prisma/prisma.service";
import { carregarContextoSolar, papelNoProcesso } from "./processo-solar.persistence";
import { pendenciasDaSaida, proximoPapel } from "./processo-solar.rules";
import { ProcessoSolarRepository } from "./processo-solar.repository";

const KIT = "Validação do Kit";
const invalido = (message: string, campo = "stages") => new RequisicaoInvalida(message, [{ campo, problema: message }]);

@Injectable()
export class PrismaProcessoSolarRepository extends ProcessoSolarRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) { super(); }

  /** Etapa do negócio no processo e o que falta para o próximo avanço. */
  situacao(dealId: string, principal: AuthPrincipal): Promise<SolarProcessState> {
    return this.prisma.comContexto(async (tx) => {
      exigeOperacaoComercial(await lerAcessoComercial(tx, principal.id));
      const deal = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, stageId: true, status: true, pipeline: { select: { processProfile: true } } } });
      if (!deal) throw new NaoEncontrado("Negócio não encontrado.");
      const processo = papelNoProcesso(deal.pipeline.processProfile, deal.stageId);
      if (!processo?.role) return solarProcessStateSchema.parse({ active: !!processo, role: null, nextRole: null, pendencies: [] });
      const nextRole = deal.status === "open" ? proximoPapel(processo.role) : null;
      const pendencies = nextRole ? pendenciasDaSaida(processo.role, await carregarContextoSolar(tx, deal.id)) : [];
      return solarProcessStateSchema.parse({ active: true, role: processo.role, nextRole, pendencies });
    });
  }

  /**
   * Ativa o processo (PLU-320): mapeia as seis etapas pelo id, acrescenta
   * "Validação do Kit" quando pedido e não toca negócios, históricos nem
   * tarefas. Negócios abertos passam a ser cobrados no próximo avanço.
   */
  ativar(pipelineId: string, input: ActivateSolarProcessRequest, principal: AuthPrincipal): Promise<SolarProcessActivation> {
    return this.prisma.comContexto(async (tx) => {
      await travarPipelines(tx, [pipelineId]);
      const acesso = await lerAcessoComercial(tx, principal.id);
      const pipeline = await tx.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: { orderBy: { position: "asc" } } } });
      if (!pipeline || !acesso.podeOperar) throw new NaoEncontrado("Pipeline não encontrado.");
      if (!podeConfigurar(acesso, principal.id, pipeline)) throw new AcessoNegado("É necessário acesso de gestão do CRM para ativar o processo.");
      if (pipeline.archivedAt) throw new EstadoInvalido("Pipeline arquivado não pode ativar o processo.");
      const profile = lerPerfilDeProcesso(pipeline.processProfile);
      if (!profile) throw invalido("Associe o pipeline ao processo Solar antes de ativá-lo.", "processProfile");
      const pedidas = Object.fromEntries(Object.entries(input.stages).map(([role, id]) => [role, id?.toLowerCase() ?? null])) as Record<SolarStageRole, string | null>;
      if (profile.activation) {
        const iguais = solarStageRoles.every((role) => pedidas[role] === null ? role === "validacaoKit" : profile.activation!.stages[role] === pedidas[role]);
        if (iguais) return profile.activation;
        throw new EstadoInvalido("O processo Solar já está ativo neste pipeline.");
      }
      const ids = pipeline.stages.map((stage) => stage.id);
      const desconhecida = solarStageRoles.find((role) => pedidas[role] !== null && !ids.includes(pedidas[role]!));
      if (desconhecida) throw invalido("Escolha etapas deste pipeline para cada papel do processo.");
      let kit = pedidas.validacaoKit;
      if (!kit) {
        const criada = await tx.pipelineStage.create({ data: {
          pipelineId, name: KIT, color: pipeline.stages.at(-1)?.color ?? "#64748b", position: (pipeline.stages.at(-1)?.position ?? -1) + 1,
        } });
        kit = criada.id;
      }
      const stages = { ...pedidas, validacaoKit: kit } as Record<SolarStageRole, string>;
      const ordem = [...pipeline.stages.map((stage) => stage.id), ...(pedidas.validacaoKit ? [] : [kit])];
      const fora = ordem.filter((id) => !Object.values(stages).includes(id));
      if (fora.length) {
        const nomes = pipeline.stages.filter((stage) => fora.includes(stage.id)).map((stage) => stage.name).join(", ");
        throw invalido(`Cada etapa do pipeline precisa de um papel no processo. Sem papel: ${nomes}.`);
      }
      if (ordem.join() !== solarStageRoles.map((role) => stages[role]).join()) throw invalido("As etapas precisam seguir a ordem do processo Solar.");
      const agora = new Date();
      const activation: SolarProcessActivation = { stages, activatedAt: agora.toISOString(), activatedById: principal.id };
      const next = pipelineProcessProfileSchema.parse({ ...profile, activation });
      await tx.pipeline.update({ where: { id: pipelineId }, data: { processProfile: next as Prisma.InputJsonValue, updatedById: principal.id } });
      await this.auditoria.append(tx, {
        eventName: "commercial.pipeline.solar_activated", entityType: "pipeline", entityId: pipelineId, companyId: pipeline.companyId,
        actorType: principal.kind === "user" ? "user" : "agent", actorId: principal.id, occurredAt: agora,
        payload: { pipelineId, stageIds: solarStageRoles.map((role) => stages[role]), createdKitStage: !pedidas.validacaoKit },
      });
      return activation;
    });
  }
}
