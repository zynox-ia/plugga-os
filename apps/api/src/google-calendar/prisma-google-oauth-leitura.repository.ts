import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { GoogleOAuthLeitura, type MaterialCifrado } from "./google-oauth-cofre.service";

/** Lê só o texto cifrado, pela função que exige sessão ativa e não abre a tabela do cofre. */
@Injectable()
export class PrismaGoogleOAuthLeitura extends GoogleOAuthLeitura {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lerCifrado(): Promise<MaterialCifrado | null> {
    const [linha] = await this.prisma.comContexto((tx) => tx.$queryRaw<MaterialCifrado[]>`
      SELECT * FROM plugga_security.credenciais_google_oauth()`);
    return linha ?? null;
  }
}
