import { createHash } from "node:crypto";

import { Injectable, ServiceUnavailableException } from "@nestjs/common";

/**
 * Onde o orçamento anexado ao pedido de compra fica guardado.
 *
 * Mesmo molde de `energy-efficiency/fatura/armazenamento.ts` — S3 falado pelo
 * SDK da AWS, servido por MinIO em produção, chave por impressão digital do
 * conteúdo — com **uma diferença deliberada: aqui a falha não é engolida**.
 *
 * Lá o arquivo é apoio à leitura, e o comentário do módulo diz por que guardar
 * não pode bloquear ler: quem precisa lançar uma fatura não fica parado porque
 * um serviço de apoio caiu. Em Compras o anexo é o próprio requisito do
 * processo (POP §2.1, item 6) e a evidência sobre a qual a análise de
 * orçamentos acontece. Um pedido que nasce sem o orçamento é um pedido que o
 * POP considera incompleto, e o Responsável de Compras descobriria isso só ao
 * abrir a tarefa para analisar cotações que não existem.
 *
 * Por isso: storage fora do ar derruba a criação do pedido inteira.
 */

export type CotacaoGuardada = { chave: string };

type ClienteS3 = {
  send(comando: unknown): Promise<unknown>;
  destroy(): void;
};

/** Orçamento é PDF ou imagem; o resto é engano. */
const EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const TIPOS_ACEITOS = Object.keys(EXTENSAO);

function configurado(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET);
}

@Injectable()
export class ArmazenamentoDeCotacoes {
  private cliente: ClienteS3 | null = null;

  private nomeDoObjeto(conteudo: Buffer, mime: string, nomeOriginal: string): string {
    const digital = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
    const extensao = EXTENSAO[mime] ?? "bin";

    const limpo = nomeOriginal
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .slice(0, 60);

    return `cotacoes/${digital}/${limpo || "orcamento"}.${extensao}`;
  }

  private async obterCliente(): Promise<ClienteS3> {
    if (!configurado()) {
      throw new ServiceUnavailableException(
        "armazenamento de anexos não configurado; o pedido de compra exige o orçamento anexado",
      );
    }
    if (this.cliente) return this.cliente;

    const { S3Client } = await import("@aws-sdk/client-s3");

    this.cliente = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "us-east-1",
      // MinIO serve os baldes por caminho, não por subdomínio.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
      },
    }) as unknown as ClienteS3;

    return this.cliente;
  }

  /**
   * Guarda o orçamento. Lança se não conseguir — quem chama está dentro da
   * criação do pedido, e a criação inteira precisa cair junto.
   */
  async guardar(conteudo: Buffer, mime: string, nomeOriginal: string): Promise<CotacaoGuardada> {
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
        `não foi possível guardar o orçamento anexado: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }
}
