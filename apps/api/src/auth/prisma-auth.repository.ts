import { Inject, Injectable } from "@nestjs/common";
import { Conflito, ServicoIndisponivel } from "../common/errors/dominio";
import { Prisma, type AuthTokenType } from "@prisma/client";
import { identityProviderSchema, type Acesso, type IdentityProvider } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido } from "../common/errors/dominio";
import { mapAcesso } from "../core/auth/user-access.mapper";
import { PrismaService } from "../prisma/prisma.service";
import {
  AuthRepository,
  IdentityLinkError,
  type AuthUserRecord,
  type CreateAuthTokenData,
  type CreateInvitedMemberData,
  type CreateSessionData,
  type LinkIdentityData,
  type SetPasswordOptions,
  type MemberFilter,
  type TeamMemberRecord,
  type UserIdentityRecord,
  type ValidAuthToken,
} from "./auth.repository";

/** Forma do id de usuário no banco; a coluna é UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const userWithAccess = {
  include: {
    platformRoles: { include: { role: true } },
    departamentos: true,
  },
} satisfies Prisma.UserDefaultArgs;

type UserWithAccess = Prisma.UserGetPayload<typeof userWithAccess>;

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly appender: AuditAppender,
  ) {
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
        throw new ServicoIndisponivel("O serviço está indisponível no momento. Tente novamente em instantes.", error);
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

  async deactivateUser(userId: string, actorId: string): Promise<AuthUserRecord | null> {
    return this.encerrarAcesso(userId, actorId, "disabled");
  }

  async removeUser(userId: string, actorId: string): Promise<AuthUserRecord | null> {
    return this.encerrarAcesso(userId, actorId, "removed");
  }

  private async encerrarAcesso(userId: string, actorId: string, status: "disabled" | "removed"): Promise<AuthUserRecord | null> {
    if (!UUID.test(userId)) return null;
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      return null;
    }
    const user = await this.prisma.$transaction(async (tx) => {
      await this.garantirOutroAdminAtivo(tx, userId);
      // Convite/reset pendentes morrem junto com o acesso: um token emitido
      // antes da desativação não pode continuar sendo uma porta de volta.
      await tx.authToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const atualizado = await tx.user.update({
        where: { id: userId },
        data: { status },
        ...userWithAccess,
      });
      await tx.session.deleteMany({ where: { userId } });
      await this.appender.append(tx, {
        eventName: status === "removed" ? "auth.user.removed" : "auth.user.deactivated",
        entityType: "user",
        entityId: userId,
        actorType: "user",
        actorId,
        payload: {},
      });
      return atualizado;
    });
    return this.toRecord(user);
  }

  /**
   * Última pessoa capaz de administrar a plataforma (FR-029). Trava, em ordem
   * fixa, as linhas do papel `admin` (`SELECT ... FOR UPDATE`) e só então
   * recontar os outros admins ativos: a contagem roda depois do bloqueio, com
   * snapshot novo, então enxerga a escrita que a outra transação acabou de
   * confirmar. Só vale se `userId` hoje é admin ativo; o resto não muda a conta.
   * Chamado dentro da transação que faz a escrita.
   */
  private async garantirOutroAdminAtivo(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT upr.user_id
      FROM user_platform_roles upr
      JOIN roles r ON r.id = upr.role_id
      WHERE r.key = 'admin'
      ORDER BY upr.user_id
      FOR UPDATE OF upr`;

    const linhas = await tx.$queryRaw<{ eh_admin_ativo: boolean; outros: bigint }[]>`
      SELECT
        EXISTS (
          SELECT 1
          FROM user_platform_roles upr
          JOIN roles r ON r.id = upr.role_id
          JOIN users u ON u.id = upr.user_id
          WHERE r.key = 'admin' AND u.status = 'active' AND upr.user_id = ${userId}::uuid
        ) AS eh_admin_ativo,
        (
          SELECT count(*)
          FROM user_platform_roles upr
          JOIN roles r ON r.id = upr.role_id
          JOIN users u ON u.id = upr.user_id
          WHERE r.key = 'admin' AND u.status = 'active' AND upr.user_id <> ${userId}::uuid
        ) AS outros`;
    const { eh_admin_ativo: ehAdminAtivo, outros } = linhas[0] ?? {
      eh_admin_ativo: false,
      outros: 0n,
    };
    if (ehAdminAtivo && outros === 0n) {
      throw new EstadoInvalido("A plataforma precisa manter ao menos um administrador ativo.");
    }
  }

  async createInvitedMember(data: CreateInvitedMemberData, actorId?: string): Promise<AuthUserRecord> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const anterior = await tx.user.findUnique({ where: { email: data.email }, select: { id: true, status: true } });
        if (anterior && anterior.status !== "removed") throw new Conflito("Já existe uma pessoa com este e-mail.");
        if (anterior) {
          // A readmissão é um convite novo, nunca uma restauração de credenciais.
          const alterado = await tx.user.updateMany({ where: { id: anterior.id, status: "removed" }, data: { name: data.name, status: "invited" } });
          if (alterado.count !== 1) throw new Conflito("Já existe uma pessoa com este e-mail.");
          await tx.session.deleteMany({ where: { userId: anterior.id } });
          await tx.authToken.deleteMany({ where: { userId: anterior.id } });
          await tx.userCredential.deleteMany({ where: { userId: anterior.id } });
          await tx.userIdentity.deleteMany({ where: { userId: anterior.id } });
          await tx.userPlatformRole.deleteMany({ where: { userId: anterior.id } });
          await tx.userDepartamento.deleteMany({ where: { userId: anterior.id } });
        }
        const created = anterior ?? await tx.user.create({
          data: { email: data.email, name: data.name, status: "invited" },
          select: { id: true },
        });
        await this.writeAcesso(tx, created.id, data.acesso);
        await this.appender.append(tx, { eventName: "auth.invite.created", entityType: "user", entityId: created.id,
          actorType: actorId ? "user" : "system", actorId: actorId ?? null, payload: { acesso: data.acesso } });
        return tx.user.findUniqueOrThrow({ where: { id: created.id }, ...userWithAccess });
      });
      return this.toRecord(user);
    } catch (error) {
      // Dois convites simultâneos para o mesmo e-mail: o service verificou
      // antes, mas a corrida só é decidida pela constraint única — traduzida
      // para a mesma mensagem do caminho verificado, em vez de subir como 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Conflito("Já existe uma pessoa com este e-mail.");
      }
      throw error;
    }
  }

  async replaceAcesso(userId: string, acesso: Acesso, actorId: string): Promise<AuthUserRecord | null> {
    if (!UUID.test(userId)) return null;
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) {
      return null;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      // Sem papel de plataforma a pessoa deixa de ser admin: a regra do último
      // admin roda na mesma transação da escrita (FR-029).
      if (acesso.plataforma === null) await this.garantirOutroAdminAtivo(tx, userId);
      await tx.userPlatformRole.deleteMany({
        where: { userId, role: { key: { in: ["admin", "desenvolvedor"] } } },
      });
      await this.writeAcesso(tx, userId, acesso);
      await this.appender.append(tx, {
        eventName: "auth.access.changed",
        entityType: "user",
        entityId: userId,
        actorType: "user",
        actorId,
        payload: { acesso },
      });
      return tx.user.findUniqueOrThrow({ where: { id: userId }, ...userWithAccess });
    });

    return this.toRecord(user);
  }

  async listMembers(filter: MemberFilter): Promise<TeamMemberRecord[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: filter.status ?? { not: "removed" },
        ...(filter.departamento ? { departamentos: { some: { departamento: filter.departamento } } } : {}),
      },
      orderBy: { createdAt: "asc" },
      // 🔒 SEGURANÇA [VULN-2, auditoria zero-trust]: teto contra `findMany` sem
      // limite (CWE-770) — a equipe não é paginada, e 2.000 é bem acima de
      // qualquer organização real deste sistema single-tenant (ADR-0008).
      take: 2_000,
      ...userWithAccess,
    });
    return users.map((user) => this.toRecord(user));
  }

  /**
   * Grava o acesso do zero, com os papéis de plataforma anteriores já removidos.
   * Desenvolvedor leva também `admin`, que é o que a regra do último admin conta.
   */
  private async writeAcesso(tx: Prisma.TransactionClient, userId: string, acesso: Acesso): Promise<void> {
    const chaves =
      acesso.plataforma === "desenvolvedor" ? ["desenvolvedor", "admin"] : acesso.plataforma === "admin" ? ["admin"] : [];
    if (chaves.length > 0) {
      const papeis = await tx.role.findMany({ where: { key: { in: chaves } }, select: { id: true, key: true } });
      // Papel fora do catálogo é seed incompleto, e gravar menos do que foi
      // concedido sem erro é pior que falhar.
      if (papeis.length !== chaves.length) {
        throw new Error(`roles missing from the catalog: ${chaves.join(", ")}`);
      }
      await tx.userPlatformRole.createMany({
        data: papeis.map((papel) => ({ userId, roleId: papel.id })),
        skipDuplicates: true,
      });
    }
    const anteriores = await tx.userDepartamento.findMany({ where: { userId } });
    await tx.userDepartamento.deleteMany({ where: { userId } });
    await tx.userDepartamento.createMany({
      data: acesso.departamentos.map(({ departamento, nivel, telas }) => ({
        userId, departamento, nivel,
        telas: telas ?? anteriores.find((entrada) => entrada.departamento === departamento)?.telas ?? [],
      })),
    });
  }

  private toRecord(user: UserWithAccess): AuthUserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      acesso: mapAcesso(user),
    };
  }
}
