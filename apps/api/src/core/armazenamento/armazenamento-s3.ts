import { createHash } from "node:crypto";

import { ServicoIndisponivel } from "../../common/errors/dominio";

/**
 * Porta de armazenamento de objetos e a única implementação S3 (spec 002, T193).
 * Compras e Obras usam o mesmo cliente, a mesma regra de nome e a mesma política
 * de falha: **lançar**, porque o arquivo é o próprio requisito do processo e um
 * registro que "salvou" sem o arquivo é um registro que não existe.
 */
export type ObjetoGuardado = { chave: string };

export interface ObjectStoragePort {
  guardar(
    conteudo: Buffer,
    mime: string,
    nomeOriginal: string,
    ...extra: unknown[]
  ): Promise<ObjetoGuardado>;
}

type ClienteS3 = {
  send(comando: unknown): Promise<unknown>;
  destroy(): void;
};

export type OpcoesDoArmazenamento = {
  /** Tipo aceito → extensão gravada. */
  extensoes: Record<string, string>;
  /** Pasta lógica dentro do balde, por exemplo `cotacoes`. */
  prefixo: string;
  /** Nome usado quando o original não sobra nada depois da limpeza. */
  nomePadrao: string;
  /** Texto da falha quando `STORAGE_ENDPOINT` não está configurado. */
  mensagemNaoConfigurado: string;
};

export function storageConfigurado(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT);
}

export class ArmazenamentoS3 {
  private cliente: ClienteS3 | null = null;

  constructor(private readonly opcoes: OpcoesDoArmazenamento) {}

  nomeDoObjeto(conteudo: Buffer, mime: string, nomeOriginal: string): string {
    const digital = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
    const extensao = this.opcoes.extensoes[mime] ?? "bin";

    const limpo = nomeOriginal
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .slice(0, 60);

    return `${this.opcoes.prefixo}/${digital}/${limpo || this.opcoes.nomePadrao}.${extensao}`;
  }

  private async obterCliente(): Promise<ClienteS3> {
    if (!storageConfigurado()) {
      throw new ServicoIndisponivel(undefined, this.opcoes.mensagemNaoConfigurado);
    }
    if (this.cliente) return this.cliente;

    const { S3Client } = await import("@aws-sdk/client-s3");

    this.cliente = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "us-east-1",
      // O servidor S3 serve os baldes por caminho, não por subdomínio.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
      },
    }) as unknown as ClienteS3;

    return this.cliente;
  }

  /** Grava no balde e lança se não conseguir. O balde é decidido por quem chama. */
  async guardarEm(
    balde: string,
    conteudo: Buffer,
    mime: string,
    nomeOriginal: string,
  ): Promise<ObjetoGuardado> {
    const cliente = await this.obterCliente();
    const chave = this.nomeDoObjeto(conteudo, mime, nomeOriginal);

    try {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await cliente.send(
        new PutObjectCommand({ Bucket: balde, Key: chave, Body: conteudo, ContentType: mime }),
      );
      return { chave };
    } catch (erro) {
      // O detalhe (SDK, endpoint, balde) vai só para o log, com o requestId; a pessoa recebe a mensagem genérica.
      throw new ServicoIndisponivel(undefined, erro);
    }
  }
}
