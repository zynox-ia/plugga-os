import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { isDepartmentOfCompany, type CompanyKey } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Prova que a pessoa alcança a empresa/departamento de Engenharia de Obras
 * antes de qualquer leitura ou escrita — mesmo raciocínio de
 * `ComprasEscopoRepository`, e o mesmo comentário dessa classe já previa este
 * exato caso: "o segundo módulo a ganhar `companyId` deve promover para
 * `core/auth`". Não promovi agora: Compras já está em produção, e uma
 * refatoração cross-módulo sem revisão do ARCHITECT (`docs/AGENT.md`) não é
 * decisão para tomar sozinho dentro desta fatia. Fica registrada aqui como o
 * gatilho de promoção que a nota original previu.
 *
 * `engenharia-obras` só existe em `waze` — o POP-OBR-001 é "WAZE ENERGIA" no
 * próprio cabeçalho, e o catálogo de departamentos (`organization.ts`)
 * confirma: a Plugga não tem este departamento. `isDepartmentOfCompany`
 * recusa a Plugga por conta própria, sem lista de exceção aqui.
 */
export const DEPARTAMENTO_DE_OBRAS = "engenharia-obras";

export abstract class ObrasEscopoRepository {
  abstract alcanca(principalId: string, companyId: CompanyKey): Promise<boolean>;

  async assertAlcanca(principalId: string, companyId: CompanyKey): Promise<void> {
    if (!(await this.alcanca(principalId, companyId))) {
      throw new ForbiddenException(`sem acesso ao departamento de engenharia de obras da empresa ${companyId}`);
    }
  }
}

@Injectable()
export class PrismaObrasEscopoRepository extends ObrasEscopoRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async alcanca(principalId: string, companyId: CompanyKey): Promise<boolean> {
    if (!isDepartmentOfCompany(companyId, DEPARTAMENTO_DE_OBRAS)) {
      return false;
    }

    const admin = await this.prisma.userPlatformRole.findFirst({
      where: { userId: principalId, role: { key: "admin" } },
      select: { userId: true },
    });
    if (admin) {
      return true;
    }

    const acesso = await this.prisma.userDepartmentAccess.findFirst({
      where: {
        userId: principalId,
        companyId,
        departmentId: DEPARTAMENTO_DE_OBRAS,
      },
      select: { userId: true },
    });

    return acesso !== null;
  }
}
