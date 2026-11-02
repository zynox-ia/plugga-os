import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDealRequestSchema, createPipelineRequestSchema, type Pipeline } from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { ClientesService } from "../src/clientes/clientes.service.js";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository.js";
import { Conflito, LimiteExcedido, NaoEncontrado, TipoNaoPermitido, ArquivoRecusado } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { ArmazenamentoDeDocumentos } from "../src/lead-documentos/armazenamento-de-documentos.js";
import { PrismaLeadDocumentosRepository } from "../src/lead-documentos/prisma-lead-documentos.repository.js";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository.js";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Documentos do lead (PLU-271) contra o Postgres e o armazenamento (RustFS de
 * ensaio) de verdade: envio, duplicata, limites, download, preview, arquivar.
 *
 *     pnpm --filter @plugga/api test:documentos
 */
const HABILITADO = process.env.RUN_STORAGE_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

const PDF = (texto = randomUUID()): Buffer => Buffer.from(`%PDF-1.4\n% documento de teste ${texto}\n%%EOF`, "utf8");

describe.skipIf(!HABILITADO)("documentos do lead: envio e consulta no Postgres + RustFS de ensaio", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditAppender();
  const config = new ConfigService({
    STORAGE_BUCKET: "plugga-arquivos",
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_REGION: "us-east-1",
    STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
    STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
  });
  const armazenamento = new ArmazenamentoDeDocumentos(config);
  const documentos = new PrismaLeadDocumentosRepository(prisma, auditoria, armazenamento);
  const pipelines = new PrismaPipelinesRepository(prisma, auditoria);
  const clientes = new ClientesService(new PrismaClientesRepository(prisma, auditoria));
  const negocios = new PrismaNegociosRepository(prisma, auditoria, clientes);

  const marca = `doc-${randomUUID().slice(0, 8)}`;
  const pessoas = {} as Record<"gestor" | "ana" | "bruno" | "forasteiro", AuthPrincipal>;
  let pipeline: Pipeline;
  let dealId: string;

  async function pessoa(chave: keyof typeof pessoas, gestor = false): Promise<void> {
    const nivel = gestor ? "gerente" : "membro";
    const usuario = await prisma.user.create({
      data: {
        email: `${marca}-${chave}@teste.local`,
        name: `${marca} ${chave}`,
        departamentos: { create: { departamento: "crm", nivel, telas: chave === "forasteiro" ? [] : ["crm.pipelines"] } },
      },
    });
    pessoas[chave] = { id: usuario.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel }] } };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.company.upsert({ where: { id: "waze" }, create: { id: "waze", name: "Waze Energia" }, update: {} });
    await pessoa("gestor", true);
    await pessoa("ana");
    await pessoa("bruno");
    await pessoa("forasteiro");

    pipeline = await pipelines.create(
      createPipelineRequestSchema.parse({
        companyId: "waze",
        name: `${marca} Solar`,
        description: null,
        valueLabel: "Investimento estimado",
        color: "#0B7A57",
        wonLabel: "Contrato assinado",
        lostLabel: "Perdido",
        stages: [{ name: "Qualificação", color: "#00A3FF", staleAfterDays: 7, asksClientConversion: false }],
        tags: [],
        lossReasons: [],
        members: [],
      }),
      pessoas.gestor,
    );

    const negocio = await negocios.create(
      createDealRequestSchema.parse({
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        ownerId: pessoas.ana.id,
        title: `${marca} Galpão logístico`,
        lead: { personType: "pj", name: `${marca} Lead`, phone: "92999990000" },
      }),
      pessoas.ana,
    );
    dealId = negocio.id;
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.leadDocument.deleteMany({ where: { dealId } });
    await prisma.deal.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.pipeline.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "envia, lista, baixa e pré-visualiza um PDF; registra o histórico e o evento sem PII",
    async () => {
      const buffer = PDF();
      const documento = await documentos.upload(dealId, "proposta", { buffer, originalName: "Proposta Setembro.pdf" }, pessoas.ana);

      expect(documento).toMatchObject({
        dealId,
        category: "proposta",
        originalName: "Proposta Setembro.pdf",
        detectedMime: "application/pdf",
        canPreview: true,
        sizeBytes: buffer.length,
        uploadedBy: { id: pessoas.ana.id, name: `${marca} ana` },
        archivedAt: null,
      });

      const lista = await documentos.list(dealId, pessoas.bruno);
      expect(lista.documents.map((d) => d.id)).toContain(documento.id);

      const baixado = await documentos.download(dealId, documento.id, pessoas.bruno);
      const partes: Buffer[] = [];
      for await (const parte of baixado.stream) partes.push(parte as Buffer);
      baixado.encerrar();
      expect(Buffer.concat(partes).equals(buffer)).toBe(true);

      const previa = await documentos.preview(dealId, documento.id, pessoas.bruno);
      previa.stream.destroy();
      previa.encerrar();
      expect(previa.documento.canPreview).toBe(true);

      const historico = await prisma.dealHistory.findMany({ where: { dealId, kind: "document_added" } });
      expect(historico).toMatchObject([{ actorId: pessoas.ana.id }]);
      expect(
        await prisma.eventLog.count({ where: { eventName: "commercial.deal.document_added", entityId: dealId } }),
      ).toBe(1);
    },
    PRAZO_MS,
  );

  it(
    "recusa o mesmo conteúdo duas vezes (409), arquivo maior que o limite (413) e tipo não aceito (415)",
    async () => {
      const buffer = PDF();
      await documentos.upload(dealId, "outros", { buffer, originalName: "unico.pdf" }, pessoas.ana);
      await expect(
        documentos.upload(dealId, "outros", { buffer, originalName: "copia.pdf" }, pessoas.ana),
      ).rejects.toBeInstanceOf(Conflito);

      const grandeDemais = Buffer.alloc(25 * 1024 * 1024 + 1, 0x25);
      await expect(
        documentos.upload(dealId, "outros", { buffer: grandeDemais, originalName: "grande.pdf" }, pessoas.ana),
      ).rejects.toBeInstanceOf(LimiteExcedido);

      await expect(
        documentos.upload(dealId, "outros", { buffer: Buffer.from("não é nenhum tipo aceito"), originalName: "nota.txt" }, pessoas.ana),
      ).rejects.toBeInstanceOf(TipoNaoPermitido);
    },
    PRAZO_MS,
  );

  it(
    "recusa um ZIP com o diretório central corrompido (422), mesmo pedindo uma extensão aceita",
    async () => {
      // EOCD declara 5 entradas, mas só a primeira está presente: o passeio sai do buffer.
      const nomeBuf = Buffer.from("[Content_Types].xml", "utf8");
      const cabecalho = Buffer.alloc(46);
      cabecalho.write("PK\x01\x02", 0, "latin1");
      cabecalho.writeUInt16LE(nomeBuf.length, 28);
      const central = Buffer.concat([cabecalho, nomeBuf]);
      const eocd = Buffer.alloc(22);
      eocd.write("PK\x05\x06", 0, "latin1");
      eocd.writeUInt16LE(5, 10);
      eocd.writeUInt32LE(central.length, 12);
      eocd.writeUInt32LE(4, 16);
      const zipCorrompido = Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), central, eocd]);

      await expect(
        documentos.upload(dealId, "outros", { buffer: zipCorrompido, originalName: "proposta.docx" }, pessoas.ana),
      ).rejects.toBeInstanceOf(ArquivoRecusado);
    },
    PRAZO_MS,
  );

  it(
    "arquiva por quem enviou; quem é de fora não vê o negócio nem o documento (404, sem revelar existência)",
    async () => {
      const documento = await documentos.upload(dealId, "outros", { buffer: PDF(), originalName: "arquivar-me.pdf" }, pessoas.bruno);

      await expect(documentos.list(dealId, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
      await expect(
        documentos.upload(dealId, "outros", { buffer: PDF(), originalName: "x.pdf" }, pessoas.forasteiro),
      ).rejects.toBeInstanceOf(NaoEncontrado);
      await expect(documentos.archive(dealId, documento.id, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
      await expect(documentos.download(dealId, documento.id, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);

      const arquivado = await documentos.archive(dealId, documento.id, pessoas.bruno);
      expect(arquivado.archivedAt).not.toBeNull();
      expect(arquivado.archivedBy).toMatchObject({ id: pessoas.bruno.id });

      const historico = await prisma.dealHistory.findMany({ where: { dealId, kind: "document_archived" } });
      expect(historico.map((h) => h.actorId)).toContain(pessoas.bruno.id);
    },
    PRAZO_MS,
  );

  it(
    "um documento ainda pendente (sem upload concluído) não aparece pronto para download",
    async () => {
      const pendente = await prisma.leadDocument.create({
        data: {
          dealId,
          category: "outros",
          originalName: "pendente.pdf",
          safeName: "pendente.pdf",
          detectedMime: "application/pdf",
          sizeBytes: 10,
          storageBucket: "plugga-arquivos",
          storageKey: `crm/leads/${dealId}/${randomUUID()}-pendente.pdf`,
          sha256: randomUUID().replace(/-/g, "").padEnd(64, "0"),
          uploadState: "pending",
        },
      });
      await expect(documentos.download(dealId, pendente.id, pessoas.ana)).rejects.toBeInstanceOf(NaoEncontrado);
      const lista = await documentos.list(dealId, pessoas.ana);
      expect(lista.documents.map((d) => d.id)).not.toContain(pendente.id);
    },
    PRAZO_MS,
  );

  it(
    "renomeia e recategoriza um documento existente",
    async () => {
      const documento = await documentos.upload(dealId, "outros", { buffer: PDF(), originalName: "original.pdf" }, pessoas.ana);
      const atualizado = await documentos.update(dealId, documento.id, { originalName: "Proposta revisada.pdf", category: "proposta" }, pessoas.ana);
      expect(atualizado).toMatchObject({ originalName: "Proposta revisada.pdf", category: "proposta" });
    },
    PRAZO_MS,
  );

  it(
    "uma pré-visualização só vale para o que o tipo permite (um .docx não tem preview)",
    async () => {
      const docx = Buffer.concat([
        Buffer.from("PK\x03\x04", "latin1"),
        // Diretório central com os dois nomes exigidos, EOCD válido.
        (() => {
          const nomes = ["[Content_Types].xml", "word/document.xml"];
          const entradas = nomes.map((nome) => {
            const nomeBuf = Buffer.from(nome, "utf8");
            const cabecalho = Buffer.alloc(46);
            cabecalho.write("PK\x01\x02", 0, "latin1");
            cabecalho.writeUInt16LE(nomeBuf.length, 28);
            return Buffer.concat([cabecalho, nomeBuf]);
          });
          const central = Buffer.concat(entradas);
          const eocd = Buffer.alloc(22);
          eocd.write("PK\x05\x06", 0, "latin1");
          eocd.writeUInt16LE(nomes.length, 10);
          eocd.writeUInt32LE(central.length, 12);
          eocd.writeUInt32LE(4, 16);
          return Buffer.concat([central, eocd]);
        })(),
      ]);
      const documento = await documentos.upload(dealId, "outros", { buffer: docx, originalName: "contrato.docx" }, pessoas.ana);
      expect(documento.canPreview).toBe(false);
      await expect(documentos.preview(dealId, documento.id, pessoas.ana)).rejects.toBeInstanceOf(TipoNaoPermitido);
      const baixado = await documentos.download(dealId, documento.id, pessoas.ana);
      baixado.stream.destroy();
      baixado.encerrar();
    },
    PRAZO_MS,
  );
});
