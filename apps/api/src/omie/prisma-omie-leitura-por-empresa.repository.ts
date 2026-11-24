import { Inject, Injectable } from "@nestjs/common";
import type { CompanyKey } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import { OmieLeituraPorEmpresa } from "./omie-conexoes.service";

/** Só o texto cifrado do par conferido, pela função `config_omie(p_empresa)`. */
@Injectable()
export class PrismaOmieLeituraPorEmpresa extends OmieLeituraPorEmpresa {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async lerCifrado(empresa: CompanyKey): Promise<{ valorCifrado: string; iv: string; tag: string } | null> {
    const [linha] = await this.prisma.comContexto((tx) => tx.$queryRaw<{ valorCifrado: string; iv: string; tag: string }[]>`
      SELECT * FROM plugga_security.config_omie(${empresa}::text)`);
    return linha ?? null;
  }
}
