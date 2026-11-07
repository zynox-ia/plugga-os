import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, type ActorType } from "@prisma/client";
import {
  leadDocumentPreviewableMimes,
  leadDocumentSchema,
  listLeadDocumentsResponseSchema,
  LEAD_DOCUMENT_MAX_BYTES,
  type LeadDocument,
  type LeadDocumentCategory,
  type ListLeadDocumentsResponse,
  type NomeDeEventoAuditavel,
  type UpdateLeadDocumentRequest,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { ArquivoRecusado, Conflito, LimiteExcedido, NaoEncontrado, TipoNaoPermitido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { exigeOperacaoComercial, lerAcessoComercial } from "../pipelines/acesso-comercial";
import { podeConfigurar, podeVer, type AcessoComercial } from "../pipelines/pipelines.rules";
import { PrismaService } from "../prisma/prisma.service";
import { ArmazenamentoDeDocumentos } from "./armazenamento-de-documentos";
import { detectarTipo } from "./deteccao-de-tipo";
import { type ArquivoEnviado, type DownloadDeDocumento, LeadDocumentosRepository } from "./lead-documentos.repository";
import { nomeSeguro } from "./lead-documentos.rules";

const DOCUMENTO_NAO_ENCONTRADO = "Documento não encontrado.";
const NEGOCIO_NAO_ENCONTRADO = "Negócio não encontrado.";
const PRAZO_PENDENTE_MS = 15 * 60 * 1000;

function paraDocumento(linha: {
  id: string;
  dealId: string;
  category: string;
  originalName: string;
  sizeBytes: number;
  detectedMime: string;
  uploadedBy: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  archivedBy: { id: string; name: string } | null;
}): LeadDocument {
  return leadDocumentSchema.parse({
    id: linha.id,
    dealId: linha.dealId,
    category: linha.category,
    originalName: linha.originalName,
    sizeBytes: linha.sizeBytes,
    detectedMime: linha.detectedMime,
    canPreview: (leadDocumentPreviewableMimes as readonly string[]).includes(linha.detectedMime),
    uploadedBy: linha.uploadedBy,
    createdAt: linha.createdAt.toISOString(),
    updatedAt: linha.updatedAt.toISOString(),
    archivedAt: linha.archivedAt?.toISOString() ?? null,
    archivedBy: linha.archivedBy,
  });
}

const SELECAO = {
  id: true,
  dealId: true,
  category: true,
  originalName: true,
  sizeBytes: true,
  detectedMime: true,
  storageKey: true,
  uploadState: true,
  uploadedById: true,
  uploadedBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  archivedBy: { select: { id: true, name: true } },
} satisfies Prisma.LeadDocumentSelect;

type LinhaCompleta = Prisma.LeadDocumentGetPayload<{ select: typeof SELECAO }>;

@Injectable()
export class PrismaLeadDocumentosRepository extends LeadDocumentosRepository {
  private readonly logger = new Logger(PrismaLeadDocumentosRepository.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
  ) {
    super();
  }

  async list(dealId: string, principal: AuthPrincipal): Promise<ListLeadDocumentsResponse> {
    await this.negocioVisivel(dealId, principal);
    await this.limparPendentesExpirados(dealId);
    const linhas = await this.prisma.comContexto((tx) => tx.leadDocument.findMany({
      where: { dealId, uploadState: "ready" },
      orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      select: SELECAO,
    }));
    return listLeadDocumentsResponseSchema.parse({ documents: linhas.map((linha) => paraDocumento(linha)) });
  }

  async upload(dealId: string, categoria: LeadDocumentCategory, arquivo: ArquivoEnviado, principal: AuthPrincipal): Promise<LeadDocument> {
    const { pipeline } = await this.negocioVisivel(dealId, principal);
    await this.limparPendentesExpirados(dealId);

    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > LEAD_DOCUMENT_MAX_BYTES) {
      throw new LimiteExcedido("O arquivo é maior que o limite de 25 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    }
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "tipo_nao_permitido") {
      throw new TipoNaoPermitido("O tipo do arquivo não é aceito (PDF, JPEG, PNG, DOCX ou XLSX).");
    }
    if (deteccao.status === "arquivo_recusado") {
      throw new ArquivoRecusado("O arquivo está corrompido, truncado ou excede os limites internos do formato.");
    }
    const tipo = deteccao.tipo;

    const sha256 = createHash("sha256").update(arquivo.buffer).digest("hex");
    const seguro = nomeSeguro(arquivo.originalName);
    const balde = this.armazenamento.balde();
    const chave = `crm/leads/${dealId}/${randomUUID()}-${seguro}`;

    let documentoId: string;
    try {
      const criado = await this.prisma.comContexto((tx) => tx.leadDocument.create({
        data: {
          dealId,
          category: categoria,
          originalName: arquivo.originalName,
          safeName: seguro,
          detectedMime: tipo,
          sizeBytes: arquivo.buffer.length,
          storageBucket: balde,
          storageKey: chave,
          sha256,
          uploadState: "pending",
          uploadedById: principal.id,
        },
        select: { id: true },
      }));
      documentoId = criado.id;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito("Este arquivo já foi enviado para este lead.");
      }
      throw erro;
    }

    // Se o envio falhar, a linha fica "pending" (nunca "sucesso sem arquivo") e
    // é limpa na próxima listagem/envio deste negócio, depois de 15 minutos.
    await this.armazenamento.enviar(chave, arquivo.buffer, tipo);

    await this.prisma.comContexto(async (tx) => {
      await this.negocioVisivel(dealId, principal, tx);
      await tx.leadDocument.update({ where: { id: documentoId }, data: { uploadState: "ready" } });
      await tx.dealHistory.create({ data: { dealId, kind: "document_added", actorId: principal.id } });
      await this.registrar(tx, "commercial.deal.document_added", dealId, pipeline.companyId, principal, {});
    });
    return this.ler(documentoId, principal);
  }

  async update(dealId: string, documentId: string, input: UpdateLeadDocumentRequest, principal: AuthPrincipal): Promise<LeadDocument> {
    await this.prisma.comContexto(async (tx) => {
      await this.negocioVisivel(dealId, principal, tx);
      const atual = await tx.leadDocument.findFirst({ where: { id: documentId, dealId }, select: { id: true } });
      if (!atual) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);
      await tx.leadDocument.update({
        where: { id: documentId },
        data: { ...(input.originalName !== undefined ? { originalName: input.originalName } : {}), ...(input.category ? { category: input.category } : {}) },
      });
    });
    return this.ler(documentId, principal);
  }

  async archive(dealId: string, documentId: string, principal: AuthPrincipal): Promise<LeadDocument> {
    await this.prisma.comContexto(async (tx) => {
      const { pipeline } = await this.negocioVisivel(dealId, principal, tx);
      const atual = await tx.leadDocument.findFirst({ where: { id: documentId, dealId }, select: { uploadedById: true, archivedAt: true } });
      if (!atual) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);

      const acesso = await lerAcessoComercial(tx, principal.id);
      const podeArquivar = atual.uploadedById === principal.id || podeConfigurar(acesso, principal.id, pipeline) || acesso.admin;
      if (!podeArquivar) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);

      if (!atual.archivedAt) {
        await tx.leadDocument.update({ where: { id: documentId }, data: { archivedAt: new Date(), archivedById: principal.id } });
        await tx.dealHistory.create({ data: { dealId, kind: "document_archived", actorId: principal.id } });
        await this.registrar(tx, "commercial.deal.document_archived", dealId, pipeline.companyId, principal, {});
      }
    });
    return this.ler(documentId, principal);
  }

  async download(dealId: string, documentId: string, principal: AuthPrincipal): Promise<DownloadDeDocumento> {
    await this.negocioVisivel(dealId, principal);
    const linha = await this.documentoPronto(dealId, documentId);
    const { objeto, cliente } = await this.armazenamento.ler(linha.storageKey);
    return { documento: paraDocumento(linha), stream: objeto.corpo as Readable, encerrar: () => cliente.destroy() };
  }

  async preview(dealId: string, documentId: string, principal: AuthPrincipal): Promise<DownloadDeDocumento> {
    await this.negocioVisivel(dealId, principal);
    const linha = await this.documentoPronto(dealId, documentId);
    if (!(leadDocumentPreviewableMimes as readonly string[]).includes(linha.detectedMime)) {
      throw new TipoNaoPermitido("Este tipo de documento não tem pré-visualização.");
    }
    const { objeto, cliente } = await this.armazenamento.ler(linha.storageKey);
    return { documento: paraDocumento(linha), stream: objeto.corpo as Readable, encerrar: () => cliente.destroy() };
  }

  async discardProposalUpload(dealId: string, documentId: string, principal: AuthPrincipal): Promise<void> {
    // Não depende do acesso atual: serve também quando ele foi revogado durante o envio.
    // A autoria e a ausência de versão protegem arquivos de terceiros e commits já concluídos.
    const result = await this.prisma.comContexto((tx) => tx.leadDocument.updateMany({
      where: { id: documentId, dealId, uploadedById: principal.id, category: "proposta", proposalVersions: { none: {} } },
      data: { uploadState: "cleanup" },
    }));
    if (result.count === 1) await this.limparObjetosPendentes(dealId);
  }

  private async documentoPronto(dealId: string, documentId: string): Promise<LinhaCompleta> {
    const linha = await this.prisma.comContexto((tx) => tx.leadDocument.findFirst({ where: { id: documentId, dealId, uploadState: "ready" }, select: SELECAO }));
    if (!linha) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);
    return linha;
  }

  private async limparPendentesExpirados(dealId: string): Promise<void> {
    await this.prisma.comContexto((tx) => tx.leadDocument.updateMany({
      where: { dealId, uploadState: "pending", createdAt: { lt: new Date(Date.now() - PRAZO_PENDENTE_MS) } },
      data: { uploadState: "cleanup" },
    }));
    await this.limparObjetosPendentes(dealId);
  }

  private async limparObjetosPendentes(dealId: string): Promise<void> {
    const rows = await this.prisma.comContexto((tx) => tx.leadDocument.findMany({ where: { dealId, uploadState: "cleanup" }, select: { id: true, storageKey: true }, take: 20 }));
    for (const row of rows) {
      try {
        await this.armazenamento.excluir(row.storageKey);
        await this.prisma.comContexto((tx) => tx.leadDocument.deleteMany({ where: { id: row.id, uploadState: "cleanup" } }));
      } catch {
        // Continua invisível e fora da unicidade por hash; próxima listagem/envio repete a limpeza.
        this.logger.warn("Limpeza de documento temporário pendente; será repetida.");
      }
    }
  }

  /** Visível a quem alcança o pipeline do negócio, de qualquer situação (aberto, ganho ou perdido). */
  private async negocioVisivel(dealId: string, principal: AuthPrincipal, tx?: Prisma.TransactionClient, bloquear = true): Promise<{ pipeline: { id: string; companyId: string }; acesso: AcessoComercial }> {
    if (!tx) return this.prisma.comContexto((banco) => this.negocioVisivel(dealId, principal, banco, false));
    const banco = tx;
    if (bloquear) await banco.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`;
    const negocio = await banco.deal.findUnique({ where: { id: dealId }, select: { pipelineId: true, ownerId: true } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const [pipeline, acesso] = await Promise.all([
      banco.pipeline.findUnique({ where: { id: negocio.pipelineId }, select: { id: true, companyId: true } }),
      lerAcessoComercial(banco, principal.id),
    ]);
    if (!pipeline || !podeVer(acesso)) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    exigeOperacaoComercial(acesso);
    return { pipeline, acesso };
  }

  private async ler(id: string, principal: AuthPrincipal): Promise<LeadDocument> {
    const documento = await this.prisma.comContexto((tx) => tx.leadDocument.findUniqueOrThrow({ where: { id }, select: SELECAO }));
    await this.negocioVisivel(documento.dealId, principal);
    return paraDocumento(documento);
  }

  private registrar(
    tx: Prisma.TransactionClient,
    evento: NomeDeEventoAuditavel,
    dealId: string,
    empresa: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName: evento,
      entityType: "deal",
      entityId: dealId,
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
