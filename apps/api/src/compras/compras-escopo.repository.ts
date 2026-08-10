import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { isDepartmentOfCompany, type CompanyKey } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Prova que a pessoa alcança a empresa antes de qualquer leitura ou escrita.
 *
 * Compras é a **primeira entidade de domínio com `companyId`**, e a camada de
 * autenticação ainda não sabe escopar por empresa: `AuthPrincipal` carrega só
 * id e papéis, o `RolesGuard` pergunta apenas se o papel consta da lista, e o
 * próprio `flattenRoles` em `@plugga/shared` documenta que "um papel concedido
 * em qualquer empresa passa a valer no guard". Sem o que está aqui, alguém
 * `financeiro` só na Plugga passaria pelo guard e alcançaria pedidos da Waze.
 *
 * O `companyId` que chega na requisição é **pretensão do navegador** até passar
 * por esta checagem. Filtrar por ele sem prová-lo não é autorização, é filtro.
 *
 * ## Dívida registrada
 *
 * Isto é funcionalidade de fundação morando num módulo de domínio. O segundo
 * módulo a ganhar `companyId` deve promovê-la para `core/auth` — `AuthPrincipal`
 * carregando as memberships e um guard reutilizável — e Compras passa a
 * consumi-lo. Promover é mudança de fundação e pede revisão do ARCHITECT,
 * conforme `docs/AGENT.md`. Duplicar esta classe num terceiro módulo, não.
 */

/** Compras vive no departamento Financeiro nas duas empresas. */
export const DEPARTAMENTO_DE_COMPRAS = "financeiro";

export abstract class ComprasEscopoRepository {
  abstract alcanca(principalId: string, companyId: CompanyKey): Promise<boolean>;

  /** Igual a `alcanca`, mas recusa em vez de devolver `false`. */
  async assertAlcanca(principalId: string, companyId: CompanyKey): Promise<void> {
    if (!(await this.alcanca(principalId, companyId))) {
      throw new ForbiddenException(`sem acesso ao departamento de compras da empresa ${companyId}`);
    }
  }
}

@Injectable()
export class PrismaComprasEscopoRepository extends ComprasEscopoRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async alcanca(principalId: string, companyId: CompanyKey): Promise<boolean> {
    // Empresa que não tem o departamento não é alcançável por ninguém — nem
    // pelo admin. Vale para as duas hoje, e continua valendo se um dia uma
    // delas deixar de ter Financeiro.
    if (!isDepartmentOfCompany(companyId, DEPARTAMENTO_DE_COMPRAS)) {
      return false;
    }

    // Admin de plataforma alcança as duas empresas sem linha de membership —
    // é a mesma regra de leitura que `visibleCompanies` aplica na navegação
    // (@plugga/shared), e não materializar acesso é o que mantém a tela de
    // permissões mostrando só o que foi realmente concedido.
    const admin = await this.prisma.userPlatformRole.findFirst({
      where: { userId: principalId, role: { key: "admin" } },
      select: { userId: true },
    });
    if (admin) {
      return true;
    }

    // Para todos os demais, acesso é o par (empresa, departamento): ter papel
    // `compras` na Plugga não abre a Waze, e pertencer à Waze sem o
    // departamento Financeiro não abre Compras.
    const acesso = await this.prisma.userDepartmentAccess.findFirst({
      where: {
        userId: principalId,
        companyId,
        departmentId: DEPARTAMENTO_DE_COMPRAS,
      },
      select: { userId: true },
    });

    return acesso !== null;
  }
}
