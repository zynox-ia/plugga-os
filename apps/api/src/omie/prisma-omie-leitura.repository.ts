import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { OmieLeitura, type MaterialCifrado } from "./omie-cofre.service";

/**
 * Lê só o texto cifrado, por função que nenhum papel de aplicação precisa da
 * tabela para chamar. A chave-mestra fica só no ambiente da API: o banco
 * sozinho não decifra nada.
 */
@Injectable()
export class PrismaOmieLeitura extends OmieLeitura {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lerCifrado(): Promise<MaterialCifrado | null> {
    const [linha] = await this.prisma.comContexto((tx) => tx.$queryRaw<MaterialCifrado[]>`SELECT * FROM plugga_security.config_omie()`);
    return linha ?? null;
  }
}
