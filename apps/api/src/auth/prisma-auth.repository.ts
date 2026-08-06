import { Inject, Injectable } from "@nestjs/common";
import { type AuthTokenType, type Prisma } from "@prisma/client";
import { roleKeySchema, type RoleKey } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import {
  AuthRepository,
  type AuthUserRecord,
  type AuthUserSummaryRecord,
  type CreateAuthTokenData,
  type CreateInvitedUserData,
  type CreateSessionData,
  type SetPasswordOptions,
  type ValidAuthToken,
} from "./auth.repository";

const userWithRoles = {
  include: { roles: { include: { role: true } } },
} satisfies Prisma.UserDefaultArgs;

type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      ...userWithRoles,
    });
    return user ? this.toRecord(user) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, ...userWithRoles });
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
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        status: "invited",
        roles: {
          create: data.roleKeys.map((key) => ({ role: { connect: { key } } })),
        },
      },
      ...userWithRoles,
    });
    return this.toRecord(user);
  }

  async createAuthToken(data: CreateAuthTokenData): Promise<void> {
    await this.prisma.authToken.create({
      data: {
        userId: data.userId,
        type: data.type,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
      select: { id: true },
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
        await tx.user.update({ where: { id: userId }, data: { status: "active" } });
      }

      if (options.revokeSessions) {
        await tx.session.deleteMany({ where: { userId } });
      }
    });
  }

  async setUserRoles(userId: string, roleKeys: RoleKey[]): Promise<AuthUserRecord | null> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) {
      return null;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      const roles = await tx.role.findMany({ where: { key: { in: roleKeys } }, select: { id: true } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id })),
        skipDuplicates: true,
      });
      return tx.user.findUniqueOrThrow({ where: { id: userId }, ...userWithRoles });
    });

    return this.toRecord(user);
  }

  async deactivateUser(userId: string): Promise<AuthUserRecord | null> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) {
      return null;
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: "disabled" },
      ...userWithRoles,
    });
    return this.toRecord(user);
  }

  async listUsers(): Promise<AuthUserSummaryRecord[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      ...userWithRoles,
    });
    return users.map((user) => ({ ...this.toRecord(user), createdAt: user.createdAt }));
  }

  private toRecord(user: UserWithRoles): AuthUserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.roles.flatMap((assignment) => {
        const parsed = roleKeySchema.safeParse(assignment.role.key);
        return parsed.success ? [parsed.data] : [];
      }),
    };
  }
}
