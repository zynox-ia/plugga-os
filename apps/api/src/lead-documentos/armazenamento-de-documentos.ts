import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { ServicoIndisponivel } from "../common/errors/dominio";

type Objeto = { corpo: NodeJS.ReadableStream; tamanho?: number; tipo?: string };

/**
 * Cliente S3 do balde único (PLU-271). Qualquer coisa que falte ou falhe aqui
 * vira "serviço indisponível": nunca um upload que parece ter dado certo sem
 * o arquivo de verdade ter chegado ao armazenamento.
 */
@Injectable()
export class ArmazenamentoDeDocumentos {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  balde(): string {
    const balde = this.config.get<string>("STORAGE_BUCKET");
    if (!balde) throw new ServicoIndisponivel("O armazenamento de documentos não está configurado.");
    return balde;
  }

  private cliente(): S3Client {
    const endpoint = this.config.get<string>("STORAGE_ENDPOINT");
    const accessKeyId = this.config.get<string>("STORAGE_ACCESS_KEY");
    const secretAccessKey = this.config.get<string>("STORAGE_SECRET_KEY");
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new ServicoIndisponivel("O armazenamento de documentos não está configurado.");
    }
    return new S3Client({
      endpoint,
      region: this.config.get<string>("STORAGE_REGION") || "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async enviar(key: string, corpo: Buffer, tipo: string): Promise<void> {
    const balde = this.balde();
    const cliente = this.cliente();
    try {
      await cliente.send(new PutObjectCommand({ Bucket: balde, Key: key, Body: corpo, ContentType: tipo }));
    } catch (causa) {
      throw new ServicoIndisponivel("Não foi possível enviar o documento agora. Tente de novo em instantes.", causa);
    } finally {
      cliente.destroy();
    }
  }

  /** Quem chama é responsável por destruir o cliente retornado, depois que o stream terminar. */
  async ler(key: string): Promise<{ objeto: Objeto; cliente: S3Client }> {
    const balde = this.balde();
    const cliente = this.cliente();
    try {
      const resposta = await cliente.send(new GetObjectCommand({ Bucket: balde, Key: key }));
      if (!resposta.Body) throw new Error("resposta sem corpo");
      return {
        objeto: { corpo: resposta.Body as NodeJS.ReadableStream, tamanho: resposta.ContentLength, tipo: resposta.ContentType },
        cliente,
      };
    } catch (causa) {
      cliente.destroy();
      throw new ServicoIndisponivel("Não foi possível ler o documento agora. Tente de novo em instantes.", causa);
    }
  }
}
