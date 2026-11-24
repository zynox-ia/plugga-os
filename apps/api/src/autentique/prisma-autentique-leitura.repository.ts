import { Injectable } from "@nestjs/common";
import type { CompanyKey } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import { AutentiqueLeitura, type MaterialCifrado } from "./autentique-cofre.service";

/**
 * Lê só o texto cifrado de uma empresa, por função que nenhum papel de aplicação
 * precisa da tabela para chamar. A chave-mestra fica só no ambiente da API: o
 * banco sozinho não decifra nada.
 */
@Injectable()
export class PrismaAutentiqueLeitura extends AutentiqueLeitura {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lerCifrado(empresa: CompanyKey): Promise<MaterialCifrado | null> {
    const [linha] = await this.prisma.comContexto((tx) => tx.$queryRaw<MaterialCifrado[]>`SELECT * FROM plugga_security.config_autentique(${empresa})`);
    return linha ?? null;
  }
}
