import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  type Type,
  mixin,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";

import type { AuthenticatedRequest } from "../../core/auth/auth.types";
import { LimiteExcedido, ServicoIndisponivel } from "../errors/dominio";
import { type RequisicaoComUpload, TAMANHO_MAXIMO_POR_REQUISICAO } from "./armazenamento-em-disco";
import { LimitadorDeUploads } from "./limitador-de-uploads";

/** Sobra além do limite para o multipart (nomes, delimitadores, campo `payload`). */
const FOLGA_DO_CORPO = 1024 * 1024;

export const PASTA_BASE = "plugga-os-uploads";

/**
 * Prepara a requisição para receber arquivos em disco. Vai ANTES do
 * `FileInterceptor`/`FilesInterceptor` (com `armazenamentoEmDisco`):
 *
 * 1. recusa de cara (413) o corpo que declara mais que o limite da requisição;
 * 2. reserva uma vaga no `LimitadorDeUploads` (503 no total, 429 por usuário);
 * 3. cria uma pasta temporária só desta requisição;
 * 4. ao fim da resposta — sucesso, erro ou conexão derrubada —, devolve a vaga
 *    e apaga a pasta com tudo que ficou nela.
 */
export function UploadEmDisco(): Type<NestInterceptor> {
  @Injectable()
  class UploadEmDiscoInterceptor implements NestInterceptor {
    private readonly logger = new Logger("UploadEmDisco");

    constructor(@Inject(LimitadorDeUploads) private readonly limitador: LimitadorDeUploads) {}

    async intercept(contexto: ExecutionContext, proximo: CallHandler): Promise<Observable<unknown>> {
      const http = contexto.switchToHttp();
      const req = http.getRequest<Request & AuthenticatedRequest & RequisicaoComUpload>();
      const res = http.getResponse<Response>();

      const declarado = Number(req.headers["content-length"]);
      if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO_POR_REQUISICAO + FOLGA_DO_CORPO) {
        throw new LimiteExcedido("O envio é maior do que o limite permitido.", "ARQUIVO_GRANDE_DEMAIS");
      }

      const usuario = req.authPrincipal?.id ?? req.ip ?? "anonimo";
      const liberar = this.limitador.adquirir(usuario);
      try {
        const base = join(tmpdir(), PASTA_BASE);
        await mkdir(base, { recursive: true, mode: 0o700 });
        req.pastaDeUpload = await mkdtemp(join(base, "req-"));
      } catch (erro) {
        liberar();
        throw new ServicoIndisponivel(undefined, erro);
      }

      const pasta = req.pastaDeUpload;
      res.once("close", () => {
        liberar();
        rm(pasta, { recursive: true, force: true }).catch((erro: unknown) => {
          // Não derruba nada, mas deixa rastro: temporário que sobra é disco que enche.
          this.logger.warn(`falha ao apagar a pasta temporária de upload: ${String(erro)}`);
        });
      });
      return proximo.handle();
    }
  }
  return mixin(UploadEmDiscoInterceptor);
}
