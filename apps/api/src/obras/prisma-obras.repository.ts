import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType, Prisma } from "@prisma/client";
import {
  obraExecucaoDetalheSchema,
  type AprovarMedicaoRequest,
  type AprovarProjetoRequest,
  type AssinarAprRequest,
  type AvancarEtapaDeObraRequest,
  type ClassificarPrioridadeRequest,
  type CompanyKey,
  type ConferirEpiRequest,
  type EncerrarPendenciaRequest,
  type EnviarProjetoParaAprovacaoRequest,
  type Incidente,
  type LancarMedicaoRequest,
  type LiberacaoSeguranca,
  type MedicaoTecnica,
  type ObraEtapa,
  type ObraExecucaoDetalhe,
  type PendenciaDeCampo,
  type ProjetoVersao,
  type ReabrirProjetoRequest,
  type RegistrarAprRequest,
  type RegistrarEpiRequest,
  type RegistrarIncidenteRequest,
  type RegistrarLiberacaoRequest,
  type RegistrarPendenciaRequest,
  type RegistroApr,
  type RegistroEpi,
  type RevogarLiberacaoRequest,
  type SolicitarCorrecaoMedicaoRequest,
  type SolicitarRevisaoDeProjetoRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertEtapaAtual,
  assertLiberacaoValida,
  assertMedicaoTransicao,
  assertPendenciaAberta,
  assertProjetoVersaoTransicao,
  assertReaberturaDeProjeto,
  assertTransicaoPermitida,
} from "./obras.rules";
import { ObrasRepository, type AnexoDeEvidencia } from "./obras.repository";

const obraInclude = {
  etapas: { orderBy: { entrouEm: "asc" as const } },
  evidencias: { orderBy: { createdAt: "asc" as const } },
  registrosEpi: { orderBy: { createdAt: "asc" as const } },
  registrosApr: { orderBy: { createdAt: "asc" as const } },
  incidentes: { orderBy: { createdAt: "asc" as const } },
  liberacoesSeguranca: { orderBy: { liberadoEm: "asc" as const } },
  pendencias: { orderBy: { createdAt: "asc" as const } },
  medicoes: { orderBy: { createdAt: "asc" as const } },
  versoesDeProjeto: { orderBy: { versao: "asc" as const } },
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
      pendencias: linha.pendencias.map((pendencia) => ({
        id: pendencia.id,
        tipo: pendencia.tipo,
        prioridade: pendencia.prioridade,
        status: pendencia.status,
        descricao: pendencia.descricao,
        abertaPorId: pendencia.abertaPorId,
        encerradoPorId: pendencia.encerradoPorId,
        encerradoEm: pendencia.encerradoEm?.toISOString() ?? null,
        createdAt: pendencia.createdAt.toISOString(),
      })),
      medicoes: linha.medicoes.map((medicao) => ({
        id: medicao.id,
        etapaExecutada: medicao.etapaExecutada,
        pendenciasRemanescentes: medicao.pendenciasRemanescentes,
        status: medicao.status,
        responsavelId: medicao.responsavelId,
        aprovadoPorId: medicao.aprovadoPorId,
        aprovadoEm: medicao.aprovadoEm?.toISOString() ?? null,
        createdAt: medicao.createdAt.toISOString(),
      })),
      versoesDeProjeto: linha.versoesDeProjeto.map((versao) => ({
        id: versao.id,
        versao: versao.versao,
        status: versao.status,
        descricao: versao.descricao,
        autorId: versao.autorId,
        aprovadoPorId: versao.aprovadoPorId,
        aprovadoEm: versao.aprovadoEm?.toISOString() ?? null,
        justificativaReabertura: versao.justificativaReabertura,
        arquivoNome: versao.arquivoNome,
        createdAt: versao.createdAt.toISOString(),
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
    dentroDaTransacao?: (tx: Prisma.TransactionClient, agora: Date) => Promise<void>,
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
      if (dentroDaTransacao) {
        await dentroDaTransacao(tx, agora);
      }
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
   * `assertTransicaoPermitida`. Marca a versão `aprovado` corrente como
   * `superado` e cria a versão seguinte em `elaboracao` — "todo retorno gera
   * nova versão, nunca sobrescreve" (POP §3) na mesma transação da etapa.
   */
  async reabrirProjeto(id: string, input: ReabrirProjetoRequest, principal: AuthPrincipal): Promise<ObraExecucaoDetalhe> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "projeto_aprovado");
    assertReaberturaDeProjeto(principal, input.justificativa);

    return this.transicionar(obra, "projeto_em_elaboracao", null, principal, "obra.projeto_reaberto", async (tx) => {
      const aprovada = await tx.projetoVersao.findFirst({ where: { obraId: obra.id, status: "aprovado" } });
      if (aprovada) {
        await tx.projetoVersao.update({ where: { id: aprovada.id }, data: { status: "superado" } });
      }
      const ultima = await tx.projetoVersao.findFirst({
        where: { obraId: obra.id },
        orderBy: { versao: "desc" },
      });
      await tx.projetoVersao.create({
        data: {
          obraId: obra.id,
          versao: (ultima?.versao ?? 0) + 1,
          status: "elaboracao",
          descricao: input.justificativa ?? "reabertura pela diretoria",
          autorId: principal.id,
          justificativaReabertura: input.justificativa ?? null,
        },
      });
    });
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

  // --- Pendência de campo (POP §6) ----------------------------------------

  private mapPendencia(p: {
    id: string;
    tipo: string;
    prioridade: string | null;
    status: string;
    descricao: string;
    abertaPorId: string;
    encerradoPorId: string | null;
    encerradoEm: Date | null;
    createdAt: Date;
  }): PendenciaDeCampo {
    return {
      id: p.id,
      tipo: p.tipo as PendenciaDeCampo["tipo"],
      prioridade: p.prioridade,
      status: p.status as PendenciaDeCampo["status"],
      descricao: p.descricao,
      abertaPorId: p.abertaPorId,
      encerradoPorId: p.encerradoPorId,
      encerradoEm: p.encerradoEm?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async registrarPendencia(
    id: string,
    input: RegistrarPendenciaRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    const obra = await this.carregar(id, input.companyId);
    const criada = await this.prisma.pendenciaDeCampo.create({
      data: { obraId: obra.id, tipo: input.tipo, descricao: input.descricao, abertaPorId: principal.id },
    });
    return this.mapPendencia(criada);
  }

  async classificarPrioridadePendencia(
    id: string,
    pendenciaId: string,
    input: ClassificarPrioridadeRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    const obra = await this.carregar(id, input.companyId);
    const registro = await this.prisma.pendenciaDeCampo.findFirst({ where: { id: pendenciaId, obraId: id } });
    if (!registro) throw new NotFoundException("pendência não encontrada");
    assertPendenciaAberta(registro.status);

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.pendenciaDeCampo.update({
        where: { id: pendenciaId },
        data: { prioridade: input.prioridade },
      });
      await this.registrarEvento(tx, {
        nome: "obra.pendencia_prioridade_classificada",
        obraId: obra.id,
        principal,
        agora,
        payload: { pendenciaId, prioridade: input.prioridade },
      });
      return linha;
    });
    return this.mapPendencia(atualizada);
  }

  async encerrarPendencia(
    id: string,
    pendenciaId: string,
    input: EncerrarPendenciaRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    const obra = await this.carregar(id, input.companyId);
    const registro = await this.prisma.pendenciaDeCampo.findFirst({ where: { id: pendenciaId, obraId: id } });
    if (!registro) throw new NotFoundException("pendência não encontrada");
    assertPendenciaAberta(registro.status);

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.pendenciaDeCampo.update({
        where: { id: pendenciaId },
        data: { status: "encerrada", encerradoPorId: principal.id, encerradoEm: agora },
      });
      await this.registrarEvento(tx, {
        nome: "obra.pendencia_encerrada",
        obraId: obra.id,
        principal,
        agora,
        payload: { tipo: registro.tipo },
      });
      return linha;
    });
    return this.mapPendencia(atualizada);
  }

  // --- Medição técnica (POP §9) -------------------------------------------

  private mapMedicao(m: {
    id: string;
    etapaExecutada: string;
    pendenciasRemanescentes: string | null;
    status: string;
    responsavelId: string;
    aprovadoPorId: string | null;
    aprovadoEm: Date | null;
    createdAt: Date;
  }): MedicaoTecnica {
    return {
      id: m.id,
      etapaExecutada: m.etapaExecutada,
      pendenciasRemanescentes: m.pendenciasRemanescentes,
      status: m.status as MedicaoTecnica["status"],
      responsavelId: m.responsavelId,
      aprovadoPorId: m.aprovadoPorId,
      aprovadoEm: m.aprovadoEm?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async lancarMedicao(id: string, input: LancarMedicaoRequest, principal: AuthPrincipal): Promise<MedicaoTecnica> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "medicao_tecnica");
    const criada = await this.prisma.medicaoTecnica.create({
      data: {
        obraId: obra.id,
        etapaExecutada: input.etapaExecutada,
        pendenciasRemanescentes: input.pendenciasRemanescentes ?? null,
        responsavelId: principal.id,
      },
    });
    return this.mapMedicao(criada);
  }

  /**
   * Aprovar a medição também avança a Obra de `medicao_tecnica` para
   * `medicao_aprovada` (POP §9/§2) — as duas coisas são a mesma decisão do
   * engenheiro, então acontecem na mesma transação.
   */
  async aprovarMedicao(
    id: string,
    medicaoId: string,
    input: AprovarMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "medicao_tecnica");
    const registro = await this.prisma.medicaoTecnica.findFirst({ where: { id: medicaoId, obraId: id } });
    if (!registro) throw new NotFoundException("medição não encontrada");
    assertMedicaoTransicao(registro.status, "aprovada");
    assertTransicaoPermitida(obra.etapaAtual, "medicao_aprovada");

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.medicaoTecnica.update({
        where: { id: medicaoId },
        data: { status: "aprovada", aprovadoPorId: principal.id, aprovadoEm: agora },
      });
      await this.fecharPassagem(tx, obra.id, agora);
      await this.moverEtapa(tx, { obra, para: "medicao_aprovada", agora });
      await this.abrirPassagem(tx, { obraId: obra.id, etapa: "medicao_aprovada", agora, responsavelId: principal.id });
      await this.registrarEvento(tx, {
        nome: "obra.medicao_aprovada",
        obraId: obra.id,
        principal,
        agora,
        payload: { medicaoId },
      });
      return linha;
    });
    return this.mapMedicao(atualizada);
  }

  /**
   * Recusar a medição devolve a Obra para `em_execucao` (POP §9, "NÃO" da
   * aprovação) — a linha de medição fica `em_correcao`, terminal; uma nova
   * medição é lançada depois de corrigido, não uma edição desta.
   */
  async solicitarCorrecaoMedicao(
    id: string,
    medicaoId: string,
    input: SolicitarCorrecaoMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "medicao_tecnica");
    const registro = await this.prisma.medicaoTecnica.findFirst({ where: { id: medicaoId, obraId: id } });
    if (!registro) throw new NotFoundException("medição não encontrada");
    assertMedicaoTransicao(registro.status, "em_correcao");
    assertTransicaoPermitida(obra.etapaAtual, "em_execucao");

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.medicaoTecnica.update({ where: { id: medicaoId }, data: { status: "em_correcao" } });
      await this.fecharPassagem(tx, obra.id, agora);
      await this.moverEtapa(tx, { obra, para: "em_execucao", agora });
      await this.abrirPassagem(tx, { obraId: obra.id, etapa: "em_execucao", agora, responsavelId: registro.responsavelId });
      await this.registrarEvento(tx, {
        nome: "obra.medicao_em_correcao",
        obraId: obra.id,
        principal,
        agora,
        payload: { medicaoId, motivo: input.motivo },
      });
      return linha;
    });
    return this.mapMedicao(atualizada);
  }

  // --- Versionamento de projeto (POP §3) ----------------------------------

  private mapVersao(v: {
    id: string;
    versao: number;
    status: string;
    descricao: string;
    autorId: string;
    aprovadoPorId: string | null;
    aprovadoEm: Date | null;
    justificativaReabertura: string | null;
    arquivoNome: string | null;
    createdAt: Date;
  }): ProjetoVersao {
    return {
      id: v.id,
      versao: v.versao,
      status: v.status as ProjetoVersao["status"],
      descricao: v.descricao,
      autorId: v.autorId,
      aprovadoPorId: v.aprovadoPorId,
      aprovadoEm: v.aprovadoEm?.toISOString() ?? null,
      justificativaReabertura: v.justificativaReabertura,
      arquivoNome: v.arquivoNome,
      createdAt: v.createdAt.toISOString(),
    };
  }

  /**
   * Só cria a primeira versão (`obra_criada`/`projeto_em_elaboracao` sem
   * nenhuma versão ainda) ou uma versão adicional dentro da elaboração — a
   * reabertura de um projeto já aprovado tem seu próprio caminho em
   * `reabrirProjeto`, que cria a versão seguinte como parte da transição de
   * etapa, não por aqui.
   */
  async criarVersaoDeProjeto(
    id: string,
    input: { companyId: string; descricao: string },
    anexo: AnexoDeEvidencia | null,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "projeto_em_elaboracao");

    const ultima = await this.prisma.projetoVersao.findFirst({
      where: { obraId: obra.id },
      orderBy: { versao: "desc" },
    });
    if (ultima && ultima.status !== "elaboracao") {
      throw new BadRequestException("já existe uma versão fora da elaboração; use a revisão em vez de criar outra");
    }

    const criada = await this.prisma.projetoVersao.create({
      data: {
        obraId: obra.id,
        versao: (ultima?.versao ?? 0) + 1,
        status: "elaboracao",
        descricao: input.descricao,
        autorId: principal.id,
        arquivoChave: anexo?.arquivoChave ?? null,
        arquivoNome: anexo?.arquivoNome ?? null,
      },
    });
    return this.mapVersao(criada);
  }

  async enviarProjetoParaAprovacao(
    id: string,
    versaoId: string,
    input: EnviarProjetoParaAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "projeto_em_elaboracao");
    const registro = await this.prisma.projetoVersao.findFirst({ where: { id: versaoId, obraId: id } });
    if (!registro) throw new NotFoundException("versão de projeto não encontrada");
    assertProjetoVersaoTransicao(registro.status, "em_aprovacao");

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.projetoVersao.update({ where: { id: versaoId }, data: { status: "em_aprovacao" } });
      await this.fecharPassagem(tx, obra.id, agora);
      await this.moverEtapa(tx, { obra, para: "em_aprovacao_tecnica", agora });
      await this.abrirPassagem(tx, { obraId: obra.id, etapa: "em_aprovacao_tecnica", agora, responsavelId: registro.autorId });
      await this.registrarEvento(tx, {
        nome: "obra.projeto_enviado_para_aprovacao",
        obraId: obra.id,
        principal,
        agora,
        payload: { versaoId },
      });
      return linha;
    });
    return this.mapVersao(atualizada);
  }

  /**
   * Aprovar a versão também avança a Obra para `projeto_aprovado` — a
   * congelação do POP §3 é sobre a Obra inteira, não só sobre a linha de
   * versão, então as duas mudanças de estado acontecem juntas.
   */
  async aprovarProjeto(
    id: string,
    versaoId: string,
    input: AprovarProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "em_aprovacao_tecnica");
    const registro = await this.prisma.projetoVersao.findFirst({ where: { id: versaoId, obraId: id } });
    if (!registro) throw new NotFoundException("versão de projeto não encontrada");
    assertProjetoVersaoTransicao(registro.status, "aprovado");
    assertTransicaoPermitida(obra.etapaAtual, "projeto_aprovado");

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.projetoVersao.update({
        where: { id: versaoId },
        data: { status: "aprovado", aprovadoPorId: principal.id, aprovadoEm: agora },
      });
      await this.fecharPassagem(tx, obra.id, agora);
      await this.moverEtapa(tx, { obra, para: "projeto_aprovado", agora });
      await this.abrirPassagem(tx, { obraId: obra.id, etapa: "projeto_aprovado", agora, responsavelId: principal.id });
      await this.registrarEvento(tx, {
        nome: "obra.projeto_aprovado",
        obraId: obra.id,
        principal,
        agora,
        payload: { versaoId },
      });
      return linha;
    });
    return this.mapVersao(atualizada);
  }

  /**
   * Recusar volta a Obra para `projeto_em_elaboracao` (POP §3, "NÃO" da
   * aprovação técnica) e a versão para `elaboracao` — é edição da mesma
   * versão, não uma nova: só a reabertura de um projeto já `aprovado` cria
   * versão nova (POP §3 só exige isso para o congelado, não para o rascunho).
   */
  async solicitarRevisaoDeProjeto(
    id: string,
    versaoId: string,
    input: SolicitarRevisaoDeProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    const obra = await this.carregar(id, input.companyId);
    assertEtapaAtual(obra.etapaAtual, "em_aprovacao_tecnica");
    const registro = await this.prisma.projetoVersao.findFirst({ where: { id: versaoId, obraId: id } });
    if (!registro) throw new NotFoundException("versão de projeto não encontrada");
    assertProjetoVersaoTransicao(registro.status, "elaboracao");
    assertTransicaoPermitida(obra.etapaAtual, "projeto_em_elaboracao");

    const agora = new Date();
    const atualizada = await this.prisma.$transaction(async (tx) => {
      const linha = await tx.projetoVersao.update({ where: { id: versaoId }, data: { status: "elaboracao" } });
      await this.fecharPassagem(tx, obra.id, agora);
      await this.moverEtapa(tx, { obra, para: "projeto_em_elaboracao", agora });
      await this.abrirPassagem(tx, { obraId: obra.id, etapa: "projeto_em_elaboracao", agora, responsavelId: registro.autorId });
      await this.registrarEvento(tx, {
        nome: "obra.projeto_revisao_solicitada",
        obraId: obra.id,
        principal,
        agora,
        payload: { versaoId, motivo: input.motivo },
      });
      return linha;
    });
    return this.mapVersao(atualizada);
  }
}
