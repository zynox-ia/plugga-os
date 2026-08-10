import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType, Prisma } from "@prisma/client";
import {
  obraExecucaoDetalheSchema,
  type AssinarAprRequest,
  type AvancarEtapaDeObraRequest,
  type CompanyKey,
  type ConferirEpiRequest,
  type Incidente,
  type LiberacaoSeguranca,
  type ObraEtapa,
  type ObraExecucaoDetalhe,
  type ReabrirProjetoRequest,
  type RegistrarAprRequest,
  type RegistrarEpiRequest,
  type RegistrarIncidenteRequest,
  type RegistrarLiberacaoRequest,
  type RegistroApr,
  type RegistroEpi,
  type RevogarLiberacaoRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { assertEtapaAtual, assertLiberacaoValida, assertReaberturaDeProjeto, assertTransicaoPermitida } from "./obras.rules";
import { ObrasRepository, type AnexoDeEvidencia } from "./obras.repository";

const obraInclude = {
  etapas: { orderBy: { entrouEm: "asc" as const } },
  evidencias: { orderBy: { createdAt: "asc" as const } },
  registrosEpi: { orderBy: { createdAt: "asc" as const } },
  registrosApr: { orderBy: { createdAt: "asc" as const } },
  incidentes: { orderBy: { createdAt: "asc" as const } },
  liberacoesSeguranca: { orderBy: { liberadoEm: "asc" as const } },
};

type ObraComRelacoes = Prisma.ObraGetPayload<{ include: typeof obraInclude }>;

@Injectable()
export class PrismaObrasRepository implements ObrasRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "service" ? "system" : "user";
  }

  /** Busca sempre condicionada à empresa — obra de outra empresa é 404, não 403. */
  private async carregar(id: string, companyId: string): Promise<ObraComRelacoes> {
    const linha = await this.prisma.obra.findFirst({
      where: { id, companyId },
      include: obraInclude,
    });
    if (!linha) throw new NotFoundException("obra não encontrada");
    return linha;
  }

  private detalhe(linha: ObraComRelacoes): ObraExecucaoDetalhe {
    return obraExecucaoDetalheSchema.parse({
      id: linha.id,
      companyId: linha.companyId as CompanyKey,
      nome: linha.nome,
      etapaAtual: linha.etapaAtual,
      createdAt: linha.createdAt.toISOString(),
      updatedAt: linha.updatedAt.toISOString(),
      etapas: linha.etapas.map((etapa) => ({
        id: etapa.id,
        etapa: etapa.etapa,
        entrouEm: etapa.entrouEm.toISOString(),
        saiuEm: etapa.saiuEm?.toISOString() ?? null,
        responsavelId: etapa.responsavelId,
      })),
      evidencias: linha.evidencias.map((evidencia) => ({
        id: evidencia.id,
        etapa: evidencia.etapa,
        autorId: evidencia.autorId,
        tipo: evidencia.tipo,
        descricao: evidencia.descricao,
        statusRelacionado: evidencia.statusRelacionado,
        arquivoNome: evidencia.arquivoNome,
        createdAt: evidencia.createdAt.toISOString(),
      })),
      registrosEpi: linha.registrosEpi.map((epi) => ({
        id: epi.id,
        colaboradorId: epi.colaboradorId,
        equipeDescricao: epi.equipeDescricao,
        epiExigido: epi.epiExigido,
        conferidoEm: epi.conferidoEm?.toISOString() ?? null,
        conferidoPorId: epi.conferidoPorId,
        createdAt: epi.createdAt.toISOString(),
      })),
      registrosApr: linha.registrosApr.map((apr) => ({
        id: apr.id,
        atividade: apr.atividade,
        segurancaAssinouId: apr.segurancaAssinouId,
        segurancaAssinouEm: apr.segurancaAssinouEm?.toISOString() ?? null,
        supervisorAssinouId: apr.supervisorAssinouId,
        supervisorAssinouEm: apr.supervisorAssinouEm?.toISOString() ?? null,
        createdAt: apr.createdAt.toISOString(),
      })),
      incidentes: linha.incidentes.map((incidente) => ({
        id: incidente.id,
        ocorreuEm: incidente.ocorreuEm.toISOString(),
        local: incidente.local,
        descricao: incidente.descricao,
        envolvidos: incidente.envolvidos,
        tipo: incidente.tipo,
        gravidade: incidente.gravidade,
        acaoImediata: incidente.acaoImediata,
        registradoPorId: incidente.registradoPorId,
        responsavelTratativaId: incidente.responsavelTratativaId,
        createdAt: incidente.createdAt.toISOString(),
      })),
      liberacoes: linha.liberacoesSeguranca.map((liberacao) => ({
        id: liberacao.id,
        incidenteId: liberacao.incidenteId,
        papelLiberador: liberacao.papelLiberador,
        liberadoPorId: liberacao.liberadoPorId,
        liberadoEm: liberacao.liberadoEm.toISOString(),
        revogadoPorId: liberacao.revogadoPorId,
        revogadoEm: liberacao.revogadoEm?.toISOString() ?? null,
        motivoRevogacao: liberacao.motivoRevogacao,
      })),
    });
  }

  async obra(id: string, companyId: string): Promise<ObraExecucaoDetalhe> {
    return this.detalhe(await this.carregar(id, companyId));
  }

  private async registrarEvento(
    tx: Prisma.TransactionClient,
    entrada: { nome: string; obraId: string; principal: AuthPrincipal; payload: Prisma.InputJsonValue; agora: Date },
  ): Promise<void> {
    await tx.eventLog.create({
      data: {
        eventName: entrada.nome,
        entityType: "obra",
        entityId: entrada.obraId,
        actorType: this.actorType(entrada.principal),
        actorId: entrada.principal.id,
        payload: entrada.payload,
        occurredAt: entrada.agora,
      },
    });
  }

  private async fecharPassagem(tx: Prisma.TransactionClient, obraId: string, agora: Date): Promise<void> {
    const aberta = await tx.obraEtapaHistorico.findFirst({ where: { obraId, saiuEm: null } });
    if (!aberta) return;
    await tx.obraEtapaHistorico.update({ where: { id: aberta.id }, data: { saiuEm: agora } });
  }

  private async abrirPassagem(
    tx: Prisma.TransactionClient,
    entrada: { obraId: string; etapa: ObraEtapa; agora: Date; responsavelId: string | null },
  ): Promise<void> {
    await tx.obraEtapaHistorico.create({
      data: {
        obraId: entrada.obraId,
        etapa: entrada.etapa,
        entrouEm: entrada.agora,
        responsavelId: entrada.responsavelId,
      },
    });
  }

  /** Condiciona o update à etapa de origem — fecha a corrida entre duas movimentações simultâneas. */
  private async moverEtapa(
    tx: Prisma.TransactionClient,
    entrada: { obra: ObraComRelacoes; para: ObraEtapa; agora: Date },
  ): Promise<void> {
    const resultado = await tx.obra.updateMany({
      where: { id: entrada.obra.id, companyId: entrada.obra.companyId, etapaAtual: entrada.obra.etapaAtual },
      data: { etapaAtual: entrada.para },
    });
    if (resultado.count === 0) {
      throw new BadRequestException("a obra mudou de etapa enquanto esta ação era processada");
    }
  }

  private async transicionar(
    obra: ObraComRelacoes,
    para: ObraEtapa,
    responsavelId: string | null,
    principal: AuthPrincipal,
    eventoNome: string,
  ): Promise<ObraExecucaoDetalhe> {
    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.fecharPassagem(tx, obra.id, agora);
      await this.moverEtapa(tx, { obra, para, agora });
      await this.abrirPassagem(tx, { obraId: obra.id, etapa: para, agora, responsavelId });
      await this.registrarEvento(tx, {
        nome: eventoNome,
        obraId: obra.id,
        principal,
        agora,
        payload: { de: obra.etapaAtual, para },
      });
    });
    return this.obra(obra.id, obra.companyId);
  }

  async avancarEtapa(id: string, input: AvancarEtapaDeObraRequest, principal: AuthPrincipal): Promise<ObraExecucaoDetalhe> {
    const obra = await this.carregar(id, input.companyId);
    assertTransicaoPermitida(obra.etapaAtual, input.paraEtapa);
    const responsavelId = input.responsavelId ?? null;
    return this.transicionar(obra, input.paraEtapa, responsavelId, principal, "obra.etapa_movida");
  }

  /**
   * Reabertura de `projeto_aprovado` (POP §3): transição de exceção fora do
   * grafo normal, guardada por `assertReaberturaDeProjeto` em vez de
   * `assertTransicaoPermitida`.
   */
  async reabrirProjeto(id: string, input: ReabrirProjetoRequest, principal: AuthPrincipal): Promise<ObraExecucaoDetalhe> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "projeto_aprovado");
    assertReaberturaDeProjeto(principal, input.justificativa);
    return this.transicionar(obra, "projeto_em_elaboracao", null, principal, "obra.projeto_reaberto");
  }

  async registrarEvidencia(
    id: string,
    input: { companyId: string; tipo: string; descricao: string; statusRelacionado?: string },
    anexo: AnexoDeEvidencia,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    const obra = await this.carregar(id, input.companyId);
    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.evidenciaDeObra.create({
        data: {
          obraId: obra.id,
          etapa: obra.etapaAtual,
          autorId: principal.id,
          tipo: input.tipo as never,
          descricao: input.descricao,
          statusRelacionado: input.statusRelacionado ?? null,
          arquivoChave: anexo.arquivoChave,
          arquivoNome: anexo.arquivoNome,
        },
      });
      await this.registrarEvento(tx, {
        nome: "obra.evidencia_registrada",
        obraId: obra.id,
        principal,
        agora,
        payload: { tipo: input.tipo, etapa: obra.etapaAtual },
      });
    });
    return this.obra(id, input.companyId);
  }

  async registrarEpi(id: string, input: RegistrarEpiRequest, principal: AuthPrincipal): Promise<RegistroEpi> {
    const obra = await this.carregar(id, input.companyId);
    const agora = new Date();
    const criado = await this.prisma.$transaction(async (tx) => {
      const registro = await tx.registroEpi.create({
        data: {
          obraId: obra.id,
          colaboradorId: input.colaboradorId ?? null,
          equipeDescricao: input.equipeDescricao ?? null,
          epiExigido: input.epiExigido,
        },
      });
      await this.registrarEvento(tx, {
        nome: "obra.epi_registrado",
        obraId: obra.id,
        principal,
        agora,
        payload: { epiExigido: input.epiExigido },
      });
      return registro;
    });
    return {
      id: criado.id,
      colaboradorId: criado.colaboradorId,
      equipeDescricao: criado.equipeDescricao,
      epiExigido: criado.epiExigido,
      conferidoEm: null,
      conferidoPorId: null,
      createdAt: criado.createdAt.toISOString(),
    };
  }

  async conferirEpi(id: string, epiId: string, input: ConferirEpiRequest, principal: AuthPrincipal): Promise<RegistroEpi> {
    await this.carregar(id, input.companyId);
    const registro = await this.prisma.registroEpi.findFirst({ where: { id: epiId, obraId: id } });
    if (!registro) throw new NotFoundException("registro de EPI não encontrado");
    const atualizado = await this.prisma.registroEpi.update({
      where: { id: epiId },
      data: { conferidoEm: new Date(), conferidoPorId: principal.id },
    });
    return {
      id: atualizado.id,
      colaboradorId: atualizado.colaboradorId,
      equipeDescricao: atualizado.equipeDescricao,
      epiExigido: atualizado.epiExigido,
      conferidoEm: atualizado.conferidoEm?.toISOString() ?? null,
      conferidoPorId: atualizado.conferidoPorId,
      createdAt: atualizado.createdAt.toISOString(),
    };
  }

  async registrarApr(id: string, input: RegistrarAprRequest, principal: AuthPrincipal): Promise<RegistroApr> {
    const obra = await this.carregar(id, input.companyId);
    const agora = new Date();
    const criado = await this.prisma.$transaction(async (tx) => {
      const registro = await tx.registroApr.create({
        data: { obraId: obra.id, atividade: input.atividade },
      });
      await this.registrarEvento(tx, {
        nome: "obra.apr_registrada",
        obraId: obra.id,
        principal,
        agora,
        payload: { atividade: input.atividade },
      });
      return registro;
    });
    return {
      id: criado.id,
      atividade: criado.atividade,
      segurancaAssinouId: null,
      segurancaAssinouEm: null,
      supervisorAssinouId: null,
      supervisorAssinouEm: null,
      createdAt: criado.createdAt.toISOString(),
    };
  }

  async assinarApr(id: string, aprId: string, input: AssinarAprRequest, principal: AuthPrincipal): Promise<RegistroApr> {
    await this.carregar(id, input.companyId);
    const registro = await this.prisma.registroApr.findFirst({ where: { id: aprId, obraId: id } });
    if (!registro) throw new NotFoundException("registro de APR não encontrado");

    const agora = new Date();
    const dados =
      input.papel === "seguranca"
        ? { segurancaAssinouId: principal.id, segurancaAssinouEm: agora }
        : { supervisorAssinouId: principal.id, supervisorAssinouEm: agora };
    const atualizado = await this.prisma.registroApr.update({ where: { id: aprId }, data: dados });
    return {
      id: atualizado.id,
      atividade: atualizado.atividade,
      segurancaAssinouId: atualizado.segurancaAssinouId,
      segurancaAssinouEm: atualizado.segurancaAssinouEm?.toISOString() ?? null,
      supervisorAssinouId: atualizado.supervisorAssinouId,
      supervisorAssinouEm: atualizado.supervisorAssinouEm?.toISOString() ?? null,
      createdAt: atualizado.createdAt.toISOString(),
    };
  }

  async registrarIncidente(id: string, input: RegistrarIncidenteRequest, principal: AuthPrincipal): Promise<Incidente> {
    const obra = await this.carregar(id, input.companyId);
    const agora = new Date();
    const criado = await this.prisma.$transaction(async (tx) => {
      const incidente = await tx.incidente.create({
        data: {
          obraId: obra.id,
          ocorreuEm: new Date(input.ocorreuEm),
          local: input.local,
          descricao: input.descricao,
          envolvidos: input.envolvidos ?? null,
          tipo: input.tipo,
          gravidade: input.gravidade,
          acaoImediata: input.acaoImediata ?? null,
          registradoPorId: principal.id,
          responsavelTratativaId: input.responsavelTratativaId ?? null,
        },
      });
      await this.registrarEvento(tx, {
        nome: "obra.incidente_registrado",
        obraId: obra.id,
        principal,
        agora,
        payload: { gravidade: input.gravidade, tipo: input.tipo },
      });
      return incidente;
    });
    return {
      id: criado.id,
      ocorreuEm: criado.ocorreuEm.toISOString(),
      local: criado.local,
      descricao: criado.descricao,
      envolvidos: criado.envolvidos,
      tipo: criado.tipo,
      gravidade: criado.gravidade,
      acaoImediata: criado.acaoImediata,
      registradoPorId: criado.registradoPorId,
      responsavelTratativaId: criado.responsavelTratativaId,
      createdAt: criado.createdAt.toISOString(),
    };
  }

  async registrarLiberacao(id: string, input: RegistrarLiberacaoRequest, principal: AuthPrincipal): Promise<LiberacaoSeguranca> {
    const obra = await this.carregar(id, input.companyId);
    if (input.incidenteId) {
      const incidente = await this.prisma.incidente.findFirst({ where: { id: input.incidenteId, obraId: obra.id } });
      if (!incidente) throw new NotFoundException("incidente não encontrado nesta obra");
    }
    const criado = await this.prisma.liberacaoSeguranca.create({
      data: {
        obraId: obra.id,
        incidenteId: input.incidenteId ?? null,
        papelLiberador: input.papelLiberador,
        liberadoPorId: principal.id,
      },
    });
    return {
      id: criado.id,
      incidenteId: criado.incidenteId,
      papelLiberador: criado.papelLiberador,
      liberadoPorId: criado.liberadoPorId,
      liberadoEm: criado.liberadoEm.toISOString(),
      revogadoPorId: criado.revogadoPorId,
      revogadoEm: criado.revogadoEm?.toISOString() ?? null,
      motivoRevogacao: criado.motivoRevogacao,
    };
  }

  async revogarLiberacao(
    id: string,
    liberacaoId: string,
    input: RevogarLiberacaoRequest,
    principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    await this.carregar(id, input.companyId);
    const registro = await this.prisma.liberacaoSeguranca.findFirst({ where: { id: liberacaoId, obraId: id } });
    if (!registro) throw new NotFoundException("liberação de segurança não encontrada");
    assertLiberacaoValida({ liberadoEm: registro.liberadoEm, revogadoEm: registro.revogadoEm });

    const atualizado = await this.prisma.liberacaoSeguranca.update({
      where: { id: liberacaoId },
      data: { revogadoEm: new Date(), revogadoPorId: principal.id, motivoRevogacao: input.motivoRevogacao },
    });
    return {
      id: atualizado.id,
      incidenteId: atualizado.incidenteId,
      papelLiberador: atualizado.papelLiberador,
      liberadoPorId: atualizado.liberadoPorId,
      liberadoEm: atualizado.liberadoEm.toISOString(),
      revogadoPorId: atualizado.revogadoPorId,
      revogadoEm: atualizado.revogadoEm?.toISOString() ?? null,
      motivoRevogacao: atualizado.motivoRevogacao,
    };
  }
}
