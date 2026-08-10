import { createHash } from "node:crypto";

import { Injectable, ServiceUnavailableException } from "@nestjs/common";

/**
 * Onde a evidência de campo fica guardada. Mesmo molde de
 * `compras/armazenamento-de-cotacoes.ts`, com o mesmo argumento de não
 * engolir falha: a evidência é o próprio requisito do POP-OBR-001 §5.1, não
 * apoio à leitura — um registro de evidência que "salvou" sem o arquivo é uma
 * evidência que não existe.
 */

export type EvidenciaGuardada = { chave: string };

type ClienteS3 = {
  send(comando: unknown): Promise<unknown>;
  destroy(): void;
};

/** POP §5.1: imagem, PDF, documento técnico ou checklist preenchido. */
const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const TIPOS_ACEITOS = Object.keys(EXTENSAO);

function configurado(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET);
}

@Injectable()
export class ArmazenamentoDeEvidencias {
  private cliente: ClienteS3 | null = null;

  private nomeDoObjeto(conteudo: Buffer, mime: string, nomeOriginal: string): string {
    const digital = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
    const extensao = EXTENSAO[mime] ?? "bin";

    const limpo = nomeOriginal
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .slice(0, 60);

    return `evidencias-de-obra/${digital}/${limpo || "evidencia"}.${extensao}`;
  }

  private async obterCliente(): Promise<ClienteS3> {
    if (!configurado()) {
      throw new ServiceUnavailableException(
        "armazenamento de anexos não configurado; a evidência exige o arquivo anexado",
      );
    }
    if (this.cliente) return this.cliente;

    const { S3Client } = await import("@aws-sdk/client-s3");

    this.cliente = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
      },
    }) as unknown as ClienteS3;

    return this.cliente;
  }

  async guardar(conteudo: Buffer, mime: string, nomeOriginal: string): Promise<EvidenciaGuardada> {
    const cliente = await this.obterCliente();
    const chave = this.nomeDoObjeto(conteudo, mime, nomeOriginal);

    try {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await cliente.send(
        new PutObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: chave,
          Body: conteudo,
          ContentType: mime,
        }),
      );
      return { chave };
    } catch (erro) {
      throw new ServiceUnavailableException(
        `não foi possível guardar a evidência: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}
