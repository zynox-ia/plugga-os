import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { InvoiceReading } from "@plugga/shared";

import { DevAuthGuard } from "../../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../../core/auth/origin-check.guard";
import { Roles } from "../../core/auth/roles.decorator";
import { RolesGuard } from "../../core/auth/roles.guard";
import { OPERAR_ESTUDO } from "../estudo.permissions.js";
import { FormatoNaoSuportadoError } from "./documento.js";
import { FaturaService } from "./fatura.service.js";
import { ImagemIndecifravelError, OcrOcupadoError } from "./ocr.js";
import { PdfIlegivelError } from "./paginas.js";

/**
 * Tipo mínimo do arquivo enviado.
 *
 * Declarado aqui em vez de instalar `@types/multer`: o `multer` já vem com o
 * `@nestjs/platform-express`, e destes campos é tudo o que se usa. Uma
 * dependência a menos para o que cabe em cinco linhas.
 */
type ArquivoEnviado = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

/**
 * Uma conta de luz não passa disso; acima é engano ou abuso.
 *
 * Subiu de 15 MB porque agora entra foto: uma digitalização em 300 dpi
 * colorida, ou uma foto de celular moderno, passa de 15 MB com facilidade, e
 * recusar por tamanho seria recusar justamente o caso que este trabalho veio
 * atender.
 */
const TAMANHO_MAXIMO = 30 * 1024 * 1024;

@Controller("energy-efficiency/invoices")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...OPERAR_ESTUDO)
export class FaturaController {
  constructor(@Inject(FaturaService) private readonly service: FaturaService) {}

  /**
   * Lê a conta de luz e devolve o que dá para aproveitar.
   *
   * Não cria estudo: é uma leitura, e quem decide se os números estão certos é
   * a pessoa na tela seguinte. Separar assim é o que permite soltar um arquivo,
   * ver o que saiu e corrigir antes de abrir o estudo.
   *
   * O arquivo original é guardado, quando há armazenamento configurado — mas a
   * leitura não depende disso.
   */
  @Post("read")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  // Uma fatura digitalizada custa alguns segundos de CPU no reconhecimento
  // óptico; o limite evita que soltar uma pasta com cinquenta arquivos ocupe a
  // API por minutos.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("arquivo", { limits: { fileSize: TAMANHO_MAXIMO } }))
  async ler(
    @UploadedFile() arquivo?: ArquivoEnviado,
    // A senha do PDF chega junto com o arquivo, no mesmo `multipart`. Nunca é
    // registrada em log nem guardada: serve para abrir o documento e morre com
    // a requisição.
    @Body("senha") senha?: string,
  ): Promise<InvoiceReading> {
    if (!arquivo) {
      throw new BadRequestException("envie a conta de luz no campo `arquivo`");
    }

    try {
      return await this.service.ler(arquivo.buffer, arquivo.originalname, senha || undefined);
    } catch (erro) {
      // O formato é conferido pelos primeiros bytes, não pela extensão nem pelo
      // `content-type`: os dois são declarados por quem envia e não provam nada
      // sobre o conteúdo. Recusar aqui é dizer à pessoa o que ela anexou de
      // fato, em vez de deixá-la achar que a fatura é que estava ruim.
      if (erro instanceof FormatoNaoSuportadoError) {
        throw new BadRequestException(
          `${arquivo.originalname} é ${erro.message}. ` +
            "Envie a conta de luz em PDF, ou uma foto dela em JPEG ou PNG.",
        );
      }

      if (erro instanceof PdfIlegivelError || erro instanceof ImagemIndecifravelError) {
        throw new BadRequestException(`${arquivo.originalname}: ${erro.message}`);
      }

      // Fila cheia é indisponibilidade momentânea, não erro de quem enviou: 503
      // com motivo, para a tela poder dizer "tente de novo" em vez de "o
      // arquivo está errado".
      if (erro instanceof OcrOcupadoError) {
        throw new ServiceUnavailableException(erro.message);
      }

      throw erro;
    }
  }
}
