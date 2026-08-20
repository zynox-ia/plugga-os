import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type AuthTokenType } from "@prisma/client";
import {
  companyKeySchema,
  companyRoleKeySchema,
  departmentIdSchema,
  identityProviderSchema,
  isDepartmentOfCompany,
  platformRoleKeySchema,
  type CompanyAccess,
  type IdentityProvider,
  type UserAccess,
} from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import {
  AuthRepository,
  IdentityLinkError,
  type AuthUserRecord,
  type CreateAuthTokenData,
  type CreateInvitedUserData,
  type CreateSessionData,
  type LinkIdentityData,
  type SetPasswordOptions,
  type TeamFilter,
  type TeamMemberRecord,
  type UserIdentityRecord,
  type ValidAuthToken,
} from "./auth.repository";

/** Forma do id de usuário no banco; a coluna é UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const userWithAccess = {
  include: {
    platformRoles: { include: { role: true } },
    memberships: {
      include: {
        roles: { include: { role: true } },
        departments: true,
      },
      orderBy: { companyId: "asc" },
    },
  },
} satisfies Prisma.UserDefaultArgs;

type UserWithAccess = Prisma.UserGetPayload<typeof userWithAccess>;

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        ...userWithAccess,
      });
      return user ? this.toRecord(user) : null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        throw new ServiceUnavailableException("banco de dados indisponível");
      }
      throw error;
    }
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    // Id que não é UUID nunca corresponde a usuário nenhum, e devolver null diz
    // exatamente isso. Sem esta guarda o Postgres recusa a conversão e o erro
    // sobe como 500 — foi o que a tela de Equipe fazia com o escape hatch de
    // desenvolvimento, cujo `x-dev-principal: user:andre` vira id sintético.
    // Os quatro chamadores já tratam null; nenhum esperava exceção.
    if (!UUID.test(id)) return null;

    const user = await this.prisma.user.findUnique({ where: { id }, ...userWithAccess });
    return user ? this.toRecord(user) : null;
  }

  async findPasswordHash(userId: string): Promise<string | null> {
    const credential = await this.prisma.userCredential.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });
    return credential?.passwordHash ?? null;
  }

  async createSession(data: CreateSessionData): Promise<void> {
    await this.prisma.session.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        absoluteExpiresAt: data.absoluteExpiresAt,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
      select: { id: true },
    });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async createInvitedUser(data: CreateInvitedUserData): Promise<AuthUserRecord> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: data.email, name: data.name, status: "invited" },
          select: { id: true },
        });
        await this.writeAccess(tx, created.id, data.access);
        return tx.user.findUniqueOrThrow({ where: { id: created.id }, ...userWithAccess });
      });
      return this.toRecord(user);
    } catch (error) {
      // Dois convites simultâneos para o mesmo e-mail: o service verificou
      // antes, mas a corrida só é decidida pela constraint única — traduzida
      // para a mesma mensagem do caminho verificado, em vez de subir como 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("a user with this email already exists");
      }
      throw error;
    }
  }

  async replaceAuthToken(data: CreateAuthTokenData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent reissues for one user before replacing the pending
      // token, so a stale reset/invite cannot survive a newer e-mail.
      await tx.user.update({ where: { id: data.userId }, data: { updatedAt: new Date() } });
      await tx.authToken.deleteMany({ where: { userId: data.userId, type: data.type, consumedAt: null } });
      await tx.authToken.create({
        data: {
          userId: data.userId,
          type: data.type,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
        select: { id: true },
      });
    });
  }

  async findValidToken(
    tokenHash: string,
    type: AuthTokenType,
    now: Date,
  ): Promise<ValidAuthToken | null> {
    const token = await this.prisma.authToken.findFirst({
      where: { tokenHash, type, consumedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });
    return token ?? null;
  }

  async consumeTokenAndSetPassword(
    tokenId: string,
    userId: string,
    passwordHash: string,
    consumedAt: Date,
    options: SetPasswordOptions,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: tokenId, consumedAt: null },
        data: { consumedAt },
      });
      if (consumed.count === 0) {
        throw new Error("auth token already consumed");
      }

      await tx.userCredential.upsert({
        where: { userId },
        create: { userId, passwordHash },
        update: { passwordHash },
      });

      if (options.activateUser) {
        // Só quem ainda está `invited` pode ser ativado por token de convite.
        // Sem a condição, um convite emitido ANTES de uma desativação desfaz a
        // desativação: o token continua válido por 72h e o update incondicional
        // devolvia a conta a `active` com senha nova.
        const activated = await tx.user.updateMany({
          where: { id: userId, status: "invited" },
          data: { status: "active" },
        });
        if (activated.count === 0) {
          throw new Error("user is not pending activation");
        }
      }

      if (options.revokeSessions) {
        await tx.session.deleteMany({ where: { userId } });
      }
    });
  }

  async findIdentityBySubject(
    provider: IdentityProvider,
    subject: string,
  ): Promise<UserIdentityRecord | null> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
    });
    if (!identity) {
      return null;
    }
    const parsed = identityProviderSchema.safeParse(identity.provider);
    // Linha com provedor fora do catálogo é lixo de migração, não identidade:
    // some da leitura em vez de autenticar por um provedor que não existe mais.
    if (!parsed.success) {
      return null;
    }
    return {
      id: identity.id,
      userId: identity.userId,
      provider: parsed.data,
      subject: identity.subject,
      emailAtLink: identity.emailAtLink,
      lastObservedEmail: identity.lastObservedEmail,
      hostedDomain: identity.hostedDomain,
    };
  }

  async linkIdentity(data: LinkIdentityData): Promise<AuthUserRecord> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const atual = await tx.user.findUnique({
          where: { id: data.userId },
          select: { status: true },
        });
        if (!atual) {
          throw new IdentityLinkError("user_not_found");
        }
        if (atual.status !== "active" && atual.status !== "invited") {
          throw new IdentityLinkError("user_not_eligible");
        }

        await tx.userIdentity.create({
          data: {
            userId: data.userId,
            provider: data.provider,
            subject: data.subject,
            emailAtLink: data.email,
            lastObservedEmail: data.email,
            hostedDomain: data.hostedDomain,
            createdAt: data.now,
            lastLoginAt: data.now,
          },
          select: { id: true },
        });

        if (atual.status === "invited") {
          // Condicionado a `invited` pelo mesmo motivo do aceite por token: uma
          // desativação que aconteceu entre a leitura acima e esta escrita não
          // pode ser desfeita por um login que já estava em andamento.
          const ativados = await tx.user.updateMany({
            where: { id: data.userId, status: "invited" },
            data: { status: "active" },
          });
          if (ativados.count === 0) {
            throw new IdentityLinkError("user_not_eligible");
          }
          // O convite cumpriu o seu papel aqui. Deixá-lo válido manteria um
          // segundo caminho de entrada para uma conta que já tem dono.
          await tx.authToken.updateMany({
            where: { userId: data.userId, type: "invite", consumedAt: null },
            data: { consumedAt: data.now },
          });
        }

        return tx.user.findUniqueOrThrow({ where: { id: data.userId }, ...userWithAccess });
      });
      return this.toRecord(user);
    } catch (error) {
      if (error instanceof IdentityLinkError) {
        throw error;
      }
      // P2002 = perdeu a corrida para a constraint única: ou este `sub` já é de
      // alguém, ou esta pessoa já tem outra conta Google. Recusa, não 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new IdentityLinkError("conflict");
      }
      throw error;
    }
  }

  async recordIdentityLogin(
    identityId: string,
    email: string,
    hostedDomain: string | null,
    now: Date,
  ): Promise<void> {
    await this.prisma.userIdentity.update({
      where: { id: identityId },
      data: { lastObservedEmail: email, hostedDomain, lastLoginAt: now },
      select: { id: true },
    });
  }

  async replaceAccess(userId: string, access: UserAccess): Promise<AuthUserRecord | null> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      return null;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      // Apagar o membership leva papéis e departamentos daquela empresa junto
      // (ON DELETE CASCADE), então revogar uma empresa é uma linha só.
      await tx.userPlatformRole.deleteMany({ where: { userId } });
      await tx.userCompanyMembership.deleteMany({ where: { userId } });
      await this.writeAccess(tx, userId, access);
      return tx.user.findUniqueOrThrow({ where: { id: userId }, ...userWithAccess });
    });

    return this.toRecord(user);
  }

  async deactivateUser(userId: string): Promise<AuthUserRecord | null> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      return null;
    }
    const user = await this.prisma.$transaction(async (tx) => {
      // Convite/reset pendentes morrem junto com o acesso: um token emitido
      // antes da desativação não pode continuar sendo uma porta de volta.
      await tx.authToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return tx.user.update({
        where: { id: userId },
        data: { status: "disabled" },
        ...userWithAccess,
      });
    });
    return this.toRecord(user);
  }

  async listTeam(filter: TeamFilter): Promise<TeamMemberRecord[]> {
    const membership: Prisma.UserCompanyMembershipWhereInput = {};
    if (filter.companyId) {
      membership.companyId = filter.companyId;
    }
    if (filter.departmentId) {
      membership.departments = { some: { departmentId: filter.departmentId } };
    }

    const users = await this.prisma.user.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        // O filtro de empresa e o de departamento casam no MESMO membership: um
        // acesso "financeiro na Waze" não pode aparecer ao filtrar Plugga +
        // financeiro só porque as duas condições existem em linhas diferentes.
        ...(Object.keys(membership).length > 0 ? { memberships: { some: membership } } : {}),
      },
      orderBy: { createdAt: "asc" },
      // 🔒 SEGURANÇA [VULN-2, auditoria zero-trust]: teto de defesa contra
      // `findMany` sem limite (CWE-770) — a API não pagina equipe hoje. 2.000
      // é bem acima de qualquer organização real usando este sistema
      // single-tenant (ADR-0008), então nunca deve afetar `assertNotLastAdmin`
      // (que também usa `listTeam`) em uso legítimo.
      take: 2_000,
      ...userWithAccess,
    });
    return users.map((user) => this.toRecord(user));
  }

  /** Grava o acesso do zero. Chamado dentro de transação, com o anterior já removido. */
  private async writeAccess(
    tx: Prisma.TransactionClient,
    userId: string,
    access: UserAccess,
  ): Promise<void> {
    const chaves = [
      ...access.platformRoles,
      ...access.companies.flatMap((company) => company.roles),
    ];
    const papeis = await tx.role.findMany({
      where: { key: { in: [...new Set(chaves)] } },
      select: { id: true, key: true },
    });
    const idPorChave = new Map(papeis.map((papel) => [papel.key, papel.id]));

    // Papel validado pelo contrato que não existe em `roles` significa seed
    // incompleto. Gravar o que sobrou deixaria a pessoa com menos acesso do que
    // foi concedido, sem erro em lugar nenhum — melhor a escrita inteira falhar.
    const ausentes = [...new Set(chaves)].filter((chave) => !idPorChave.has(chave));
    if (ausentes.length > 0) {
      throw new Error(`roles missing from the catalog: ${ausentes.join(", ")}`);
    }

    await tx.userPlatformRole.createMany({
      data: access.platformRoles.flatMap((key) => {
        const roleId = idPorChave.get(key);
        return roleId ? [{ userId, roleId }] : [];
      }),
      skipDuplicates: true,
    });

    for (const company of access.companies) {
      await tx.userCompanyMembership.create({
        data: { userId, companyId: company.companyId },
        select: { userId: true },
      });
      await tx.userCompanyRole.createMany({
        data: company.roles.flatMap((key) => {
          const roleId = idPorChave.get(key);
          return roleId ? [{ userId, companyId: company.companyId, roleId }] : [];
        }),
        skipDuplicates: true,
      });
      await tx.userDepartmentAccess.createMany({
        data: company.departments.map((department) => ({
          userId,
          companyId: company.companyId,
          departmentId: department.departmentId,
          isManager: department.isManager,
        })),
        skipDuplicates: true,
      });
    }
  }

  private toRecord(user: UserWithAccess): AuthUserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      access: {
        platformRoles: user.platformRoles.flatMap((assignment) => {
          const parsed = platformRoleKeySchema.safeParse(assignment.role.key);
          return parsed.success ? [parsed.data] : [];
        }),
        companies: user.memberships.flatMap((membership) => {
          const empresa = companyKeySchema.safeParse(membership.companyId);
          if (!empresa.success) {
            return [];
          }

          const company: CompanyAccess = {
            companyId: empresa.data,
            roles: membership.roles.flatMap((assignment) => {
              const parsed = companyRoleKeySchema.safeParse(assignment.role.key);
              return parsed.success ? [parsed.data] : [];
            }),
            // Uma linha para um departamento que saiu do catálogo é lixo de
            // migração, não acesso: some da leitura em vez de derrubar o login.
            departments: membership.departments.flatMap((department) => {
              const parsed = departmentIdSchema.safeParse(department.departmentId);
              if (!parsed.success || !isDepartmentOfCompany(empresa.data, parsed.data)) {
                return [];
              }
              return [{ departmentId: parsed.data, isManager: department.isManager }];
            }),
          };

          return [company];
        }),
      },
    };
  }
}
