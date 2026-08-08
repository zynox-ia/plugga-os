import {
  BadRequestException,
  Controller,
  Inject,
  Post,
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
import { FaturaService } from "./fatura.service.js";

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

/** Uma fatura de distribuidora não passa disso; acima é engano ou abuso. */
const TAMANHO_MAXIMO = 15 * 1024 * 1024;

/** Nomeia o que o arquivo é de fato, pelos primeiros bytes. */
function formatoReal(conteudo: Buffer): string {
  const inicio = conteudo.subarray(0, 4).toString("hex");

  if (inicio.startsWith("ffd8ff")) return "uma foto JPEG";
  if (inicio === "89504e47") return "uma imagem PNG";
  if (inicio === "504b0304") return "um arquivo ZIP (talvez .docx ou .xlsx)";
  if (inicio.startsWith("d0cf11e0")) return "um documento antigo do Office";
  return "de um formato que não reconheço";
}

@Controller("energy-efficiency/invoices")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...OPERAR_ESTUDO)
export class FaturaController {
  constructor(@Inject(FaturaService) private readonly service: FaturaService) {}

  /**
   * Lê a conta de luz e devolve o que dá para aproveitar.
   *
   * Não cria estudo nem grava nada: é uma leitura, e quem decide se os números
   * estão certos é a pessoa na tela seguinte. Separar assim é o que permite
   * soltar um arquivo, ver o que saiu e corrigir antes de abrir o estudo.
   */
  @Post("read")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  // Cada leitura descomprime o PDF inteiro; o limite evita que soltar uma pasta
  // com cinquenta arquivos ocupe a API por minutos.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("arquivo", { limits: { fileSize: TAMANHO_MAXIMO } }))
  ler(@UploadedFile() arquivo?: ArquivoEnviado): InvoiceReading {
    if (!arquivo) {
      throw new BadRequestException("envie a conta de luz no campo `arquivo`");
    }

    // Confere a assinatura do formato, não a extensão nem o content-type: os
    // dois são declarados por quem envia e não provam nada sobre o conteúdo.
    // Não é preciosismo — 18 das 73 faturas do CRM são foto renomeada para
    // `.pdf`, e sem esta checagem elas entrariam como "PDF ilegível" em vez de
    // dizer à pessoa o que ela realmente anexou.
    if (arquivo.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new BadRequestException(
        `${arquivo.originalname} é ${formatoReal(arquivo.buffer)}, não um PDF. ` +
          "Envie a conta de luz como veio da distribuidora; foto da conta ainda não é lida.",
      );
    }

    return this.service.ler(arquivo.buffer, arquivo.originalname);
  }
}
