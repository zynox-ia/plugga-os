import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { Inject, Injectable } from "@nestjs/common";
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
import { lerAcessoComercial } from "../pipelines/acesso-comercial";
import { podeConfigurar, podeVer } from "../pipelines/pipelines.rules";
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
    const linhas = await this.prisma.leadDocument.findMany({
      where: { dealId, uploadState: { not: "pending" } },
      orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      select: SELECAO,
    });
    return listLeadDocumentsResponseSchema.parse({ documents: linhas.map(paraDocumento) });
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
      const criado = await this.prisma.leadDocument.create({
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
      });
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

    await this.prisma.$transaction(async (tx) => {
      await tx.leadDocument.update({ where: { id: documentoId }, data: { uploadState: "ready" } });
      await tx.dealHistory.create({ data: { dealId, kind: "document_added", actorId: principal.id } });
      await this.registrar(tx, "commercial.deal.document_added", dealId, pipeline.companyId, principal, {});
    });
    return this.ler(documentoId);
  }

  async update(dealId: string, documentId: string, input: UpdateLeadDocumentRequest, principal: AuthPrincipal): Promise<LeadDocument> {
    await this.negocioVisivel(dealId, principal);
    const atual = await this.prisma.leadDocument.findFirst({ where: { id: documentId, dealId }, select: { id: true } });
    if (!atual) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);
    await this.prisma.leadDocument.update({
      where: { id: documentId },
      data: { ...(input.originalName !== undefined ? { originalName: input.originalName } : {}), ...(input.category ? { category: input.category } : {}) },
    });
    return this.ler(documentId);
  }

  async archive(dealId: string, documentId: string, principal: AuthPrincipal): Promise<LeadDocument> {
    const { pipeline } = await this.negocioVisivel(dealId, principal);
    const atual = await this.prisma.leadDocument.findFirst({ where: { id: documentId, dealId }, select: { uploadedById: true, archivedAt: true } });
    if (!atual) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);

    const acesso = await lerAcessoComercial(this.prisma, principal.id);
    const podeArquivar = atual.uploadedById === principal.id || podeConfigurar(acesso, principal.id, pipeline) || acesso.admin;
    if (!podeArquivar) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);

    if (!atual.archivedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.leadDocument.update({ where: { id: documentId }, data: { archivedAt: new Date(), archivedById: principal.id } });
        await tx.dealHistory.create({ data: { dealId, kind: "document_archived", actorId: principal.id } });
        await this.registrar(tx, "commercial.deal.document_archived", dealId, pipeline.companyId, principal, {});
      });
    }
    return this.ler(documentId);
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

  private async documentoPronto(dealId: string, documentId: string): Promise<LinhaCompleta> {
    const linha = await this.prisma.leadDocument.findFirst({ where: { id: documentId, dealId, uploadState: "ready" }, select: SELECAO });
    if (!linha) throw new NaoEncontrado(DOCUMENTO_NAO_ENCONTRADO);
    return linha;
  }

  private async limparPendentesExpirados(dealId: string): Promise<void> {
    await this.prisma.leadDocument.deleteMany({
      where: { dealId, uploadState: "pending", createdAt: { lt: new Date(Date.now() - PRAZO_PENDENTE_MS) } },
    });
  }

  /** Visível a quem alcança o pipeline do negócio, de qualquer situação (aberto, ganho ou perdido). */
  private async negocioVisivel(dealId: string, principal: AuthPrincipal): Promise<{ pipeline: { id: string; companyId: string } }> {
    const negocio = await this.prisma.deal.findUnique({ where: { id: dealId }, select: { pipelineId: true } });
    if (!negocio) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    const [pipeline, acesso] = await Promise.all([
      this.prisma.pipeline.findUnique({ where: { id: negocio.pipelineId }, select: { id: true, companyId: true } }),
      lerAcessoComercial(this.prisma, principal.id),
    ]);
    if (!pipeline || !podeVer(acesso)) throw new NaoEncontrado(NEGOCIO_NAO_ENCONTRADO);
    return { pipeline };
  }

  private async ler(id: string): Promise<LeadDocument> {
    return paraDocumento(await this.prisma.leadDocument.findUniqueOrThrow({ where: { id }, select: SELECAO }));
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
    return principal.kind === "user" ? "user" : "system";
  }
}
