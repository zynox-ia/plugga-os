import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { TelegramLeitura, type MaterialCifrado } from "./telegram-cofre.service";

/**
 * Lê só o texto cifrado, por função que nenhum papel de aplicação precisa da
 * tabela para chamar. A chave-mestra fica só no ambiente da API: o banco
 * sozinho não decifra nada.
 */
@Injectable()
export class PrismaTelegramLeitura extends TelegramLeitura {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lerCifrado(): Promise<MaterialCifrado | null> {
    const [linha] = await this.prisma.comContexto((tx) => tx.$queryRaw<MaterialCifrado[]>`SELECT * FROM plugga_security.config_telegram()`);
    return linha ?? null;
  }
}
