import { createHash } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

/**
 * Onde a conta de luz enviada fica guardada.
 *
 * Antes o arquivo era lido e descartado. Isso custa três coisas que só
 * aparecem depois: não dá para reabrir a fatura que originou um número
 * questionado meses atrás; não dá para reprocessar o acervo quando o leitor
 * melhora — e ele vai melhorar, porque layout de distribuidora muda; e não dá
 * para mostrar o documento ao lado da conferência.
 *
 * O armazenamento é S3, falado com o SDK da AWS. Em produção o servidor é
 * MinIO, que fala o mesmo protocolo — a API não sabe a diferença, e trocar por
 * S3 de verdade depois é mudar variável de ambiente, não código.
 *
 * **Guardar nunca bloqueia ler.** Se o armazenamento estiver fora do ar, a
 * leitura acontece do mesmo jeito e a resposta sai com `arquivoChave` nula. A
 * pessoa que precisa lançar uma fatura não pode ficar parada porque um serviço
 * de apoio caiu.
 */

export type ArquivoGuardado = {
  /** Caminho do objeto no balde; nulo quando não foi possível guardar. */
  chave: string | null;
};

type ClienteS3 = {
  send(comando: unknown): Promise<unknown>;
  destroy(): void;
};

/** Extensão pelo tipo real, para o objeto guardado abrir com um clique. */
const EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tif",
  "image/bmp": "bmp",
};

function configurado(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET);
}

@Injectable()
export class ArmazenamentoDeFaturas {
  private readonly log = new Logger(ArmazenamentoDeFaturas.name);
  private cliente: ClienteS3 | null = null;

  /**
   * Nome do objeto: impressão digital do conteúdo, e o nome enviado como pista.
   *
   * O hash faz o nome ser função do arquivo, então reenviar a mesma
   * fatura sobrescreve em vez de duplicar. É o que mantém o balde limpo quando
   * alguém solta a mesma pasta duas vezes — e o que torna a operação
   * idempotente sem precisar consultar nada antes.
   */
  private nomeDoObjeto(conteudo: Buffer, mime: string, nomeOriginal: string): string {
    const digital = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
    const extensao = EXTENSAO[mime] ?? "bin";

    // O nome original entra só como pista para quem for olhar o balde; tudo que
    // não for letra, número, ponto ou hífen sai fora para não haver caminho
    // criado por quem envia o arquivo.
    //
    // A extensão que veio no nome é descartada, e não complementada: ela é
    // declarada por quem envia e costuma mentir. Sem isso, `fatura.pdf` vira
    // `fatura.pdf.pdf`, e as 18 faturas do CRM que são foto salva como `.pdf`
    // virariam `conta.pdf.jpg` — um nome que descreve a mentira em vez do
    // arquivo. Fica `conta.jpg`, que é o que ele é.
    const limpo = nomeOriginal
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .slice(0, 60);

    return `faturas/${digital}/${limpo || "fatura"}.${extensao}`;
  }

  private async obterCliente(): Promise<ClienteS3 | null> {
    if (!configurado()) return null;
    if (this.cliente) return this.cliente;

    const { S3Client } = await import("@aws-sdk/client-s3");

    this.cliente = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "us-east-1",
      // MinIO serve os baldes por caminho, não por subdomínio: sem isto o SDK
      // tentaria `http://balde.minio:9000` e não resolveria o nome.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
      },
    }) as unknown as ClienteS3;

    return this.cliente;
  }

  async guardar(conteudo: Buffer, mime: string, nomeOriginal: string): Promise<ArquivoGuardado> {
    const cliente = await this.obterCliente();
    if (!cliente) return { chave: null };

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
      // Registrado e engolido de propósito: ver o comentário do topo. Guardar é
      // apoio; ler a fatura é o serviço.
      this.log.warn(
        `não foi possível guardar ${chave}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      return { chave: null };
    }
  }
}
