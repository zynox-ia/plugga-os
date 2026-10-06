import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline, Transform } from "node:stream";

import { LimiteExcedido } from "../errors/dominio";

/** 25 MB por arquivo e 60 MB por requisição (FR-045). */
export const TAMANHO_MAXIMO_POR_ARQUIVO = 25 * 1024 * 1024;
export const TAMANHO_MAXIMO_POR_REQUISICAO = 60 * 1024 * 1024;

/** O que o multer deixa em `req.file(s)` com este armazenamento. */
export interface ArquivoEnviado {
  /** Caminho do temporário; vive só até o fim da requisição. */
  path: string;
  originalname: string;
  /** Tipo declarado pelo cliente: não é confiável, quem decide é `inspecionarArquivo`. */
  mimetype: string;
  size: number;
}

export interface RequisicaoComUpload {
  /** Pasta temporária desta requisição (criada por `UploadEmDisco`). */
  pastaDeUpload?: string;
  bytesRecebidos?: number;
}

type MulterArquivo = { stream: NodeJS.ReadableStream; originalname: string; mimetype: string };
type Retorno = (erro: Error | null, info?: Partial<ArquivoEnviado>) => void;

/**
 * Motor de armazenamento do multer em disco (equivalente ao `diskStorage`, com
 * duas diferenças): grava na pasta temporária da requisição, com nome gerado
 * por nós (o nome do cliente nunca vira caminho), e conta os bytes da
 * requisição inteira para recusar acima de 60 MB sem esperar o fim.
 *
 * É um objeto próprio, e não `diskStorage`, porque `multer` não é dependência
 * direta da API (vem pelo `@nestjs/platform-express`) e o motor é um contrato
 * pequeno e estável (`_handleFile` / `_removeFile`).
 */
export const armazenamentoEmDisco = {
  _handleFile(req: RequisicaoComUpload, arquivo: MulterArquivo, cb: Retorno): void {
    const pasta = req.pastaDeUpload;
    if (!pasta) {
      cb(new Error("pasta de upload não preparada"));
      return;
    }
    const caminho = join(pasta, randomUUID());
    let doArquivo = 0;
    const contador = new Transform({
      transform(pedaco: Buffer, _codificacao, pronto) {
        doArquivo += pedaco.length;
        req.bytesRecebidos = (req.bytesRecebidos ?? 0) + pedaco.length;
        if (req.bytesRecebidos > TAMANHO_MAXIMO_POR_REQUISICAO) {
          pronto(new LimiteExcedido("O envio é maior do que o limite permitido.", "ARQUIVO_GRANDE_DEMAIS"));
          return;
        }
        pronto(null, pedaco);
      },
    });
    pipeline(
      arquivo.stream,
      contador,
      createWriteStream(caminho, { flags: "wx", mode: 0o600 }),
      (erro) => (erro ? cb(erro) : cb(null, { path: caminho, size: doArquivo })),
    );
  },

  _removeFile(_req: unknown, arquivo: Partial<ArquivoEnviado>, cb: (erro: Error | null) => void): void {
    if (!arquivo.path) {
      cb(null);
      return;
    }
    rm(arquivo.path, { force: true }).then(() => cb(null), cb);
  },
};
