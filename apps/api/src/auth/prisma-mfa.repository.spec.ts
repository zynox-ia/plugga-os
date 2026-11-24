import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AuditAppender } from "../audit/audit-appender";
import { ServicoIndisponivel } from "../common/errors/dominio";
import { PrismaMfaRepository } from "./prisma-mfa.repository";

describe("MFA persistence sanitiza falhas do driver e preserva decisões do serviço", () => {
  const driverError = () => new Prisma.PrismaClientKnownRequestError("query encryptedSecret=segredo-interno hash=credencial-interna", { code: "P1001", clientVersion: "6.15.0" });
  it("erros de infraestrutura viram domínio503 sem causa/query/credenciais", async () => {
    const db = { $transaction: vi.fn().mockRejectedValue(driverError()), mfaChallenge: { findUnique: vi.fn().mockRejectedValue(driverError()) } };
    const repo = new PrismaMfaRepository(db as never, new AuditAppender());
    for (const operation of [repo.withUsersLocked(["01234567-0123-0123-0123-0123456789ab"], async () => null), repo.findChallenge("hash-opaco")]) {
      const error = await operation.catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ServicoIndisponivel);
      expect(String(error)).not.toMatch(/segredo-interno|credencial-interna|encryptedSecret/);
      expect(JSON.stringify(error)).not.toMatch(/segredo-interno|credencial-interna|encryptedSecret/);
    }
  });
  it.each([new UnauthorizedException("invalid MFA"), new ForbiddenException("Confirme o segundo fator")])("preserva erro de política lançado pelo callback %s", async (error) => {
    const db = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ $queryRaw: vi.fn().mockResolvedValue([]) }) };
    const repo = new PrismaMfaRepository(db as never, new AuditAppender());
    await expect(repo.withUsersLocked(["01234567-0123-0123-0123-0123456789ab"], async () => { throw error; })).rejects.toBe(error);
  });
});
