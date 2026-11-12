import { Injectable } from "@nestjs/common";

import { PrismaAuthService } from "../prisma/prisma-auth.service";
import { BrevoLeitura, type MaterialCifrado } from "./brevo-cofre.service";

/** Lê só o texto cifrado, pelo pool de autenticação, que não alcança a tabela. */
@Injectable()
export class PrismaBrevoLeitura extends BrevoLeitura {
  constructor(private readonly prisma: PrismaAuthService) {
    super();
  }

  async lerCifrado(): Promise<MaterialCifrado | null> {
    const [linha] = await this.prisma.$queryRaw<MaterialCifrado[]>`SELECT * FROM plugga_security.config_brevo()`;
    return linha ?? null;
  }
}
