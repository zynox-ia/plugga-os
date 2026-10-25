import { Inject, Injectable } from "@nestjs/common";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Quem pode ser o responsável de um pedido: alguém ativo de Suprimentos (ou um
 * admin). É ele que carrega a accountability do indicador 4.2 do POP: apontar
 * alguém de fora do departamento poria o backlog crítico no nome de quem não
 * tem como trabalhar o pedido, e o indicador individual viraria ficção.
 */
export abstract class ResponsavelDeComprasRepository {
  abstract podeSerResponsavel(pessoaId: string): Promise<boolean>;

  async assertPodeSerResponsavel(pessoaId: string): Promise<void> {
    if (!(await this.podeSerResponsavel(pessoaId))) {
      throw new RequisicaoInvalida("o responsável do pedido precisa ser de Suprimentos");
    }
  }
}

@Injectable()
export class PrismaResponsavelDeComprasRepository extends ResponsavelDeComprasRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async podeSerResponsavel(pessoaId: string): Promise<boolean> {
    const pessoa = await this.prisma.user.findFirst({
      where: {
        id: pessoaId,
        status: "active",
        OR: [
          { platformRoles: { some: { role: { key: "admin" } } } },
          { departamentos: { some: { departamento: "suprimentos" } } },
        ],
      },
      select: { id: true },
    });
    return pessoa !== null;
  }
}
