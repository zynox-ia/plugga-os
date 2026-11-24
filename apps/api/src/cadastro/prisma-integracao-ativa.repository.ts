import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { IntegracaoAtivaRepository } from "./consulta-cadastral.service";

/** Pergunta ao banco só "está ligada?"; a função exige sessão e não devolve o conteúdo do cofre. */
@Injectable()
export class PrismaIntegracaoAtivaRepository extends IntegracaoAtivaRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ativa(id: string): Promise<boolean> {
    const [linha] = await this.prisma.comContexto((tx) => tx.$queryRaw<{ ativa: boolean | null }[]>`
      SELECT plugga_security.integracao_ativa(${id}) AS ativa`);
    return linha?.ativa === true;
  }
}
