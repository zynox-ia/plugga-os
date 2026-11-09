import { randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditAppender } from "../src/audit/audit-appender";
import { MfaCrypto, totp } from "../src/auth/mfa-crypto";
import { MfaService } from "../src/auth/mfa.service";
import { PrismaMfaRepository } from "../src/auth/prisma-mfa.repository";
import { PrismaAuthRepository } from "../src/auth/prisma-auth.repository";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { hashToken } from "../src/core/auth/token.util";
import type { PrismaAuthService } from "../src/prisma/prisma-auth.service";
import { validarPapelBanco } from "../src/prisma/validar-papel-banco";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const ENABLED = process.env.RUN_MFA_INTEGRATION_TESTS === "true";
const KEY = Buffer.alloc(32, 42).toString("base64"), PROOF = { method: "password" as const, credentialHash: "hash-sintetico-mfa" };
describe.skipIf(!ENABLED)("MFA em PostgreSQL com login auth restrito e concorrência real", { timeout: 30_000 }, () => {
  const root = new PrismaClient(), prefix = `mfa_${randomBytes(8).toString("hex")}`;
  const roles: string[] = [], users: string[] = [], clients: PrismaClient[] = [];
  let auth: PrismaClient, runtime: PrismaClient, jobs: PrismaClient, service: MfaService, safe = false;
  const makeService = (appender = new AuditAppender(), key: string | undefined = KEY) => new MfaService(new PrismaMfaRepository(auth as PrismaAuthService, appender), new ConfigService({ MFA_ENCRYPTION_KEY: key }), new NullSessionCache());
  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT); safe = true;
    await root.$connect();
    const [executor] = await root.$queryRaw<{ superuser: boolean }[]>`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
    expect(executor?.superuser).toBe(true);
    for (const pool of ["auth", "runtime", "jobs"]) {
      const role = `${prefix}_${pool}`, password = randomBytes(32).toString("hex");
      if (!/^mfa_[a-f0-9]+_(auth|runtime|jobs)$/.test(role)) throw new Error("Invalid fixture role");
      await root.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('plugga.mfa_test_role', ${role}, true), set_config('plugga.mfa_test_password', ${password}, true)`;
        await tx.$executeRawUnsafe("DO $fixture$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', current_setting('plugga.mfa_test_role'), current_setting('plugga.mfa_test_password')); END $fixture$");
      });
      roles.push(role);
      const group = pool === "auth" ? "plugga_auth_runtime" : pool === "runtime" ? "plugga_runtime" : "plugga_jobs_runtime";
      await root.$executeRawUnsafe(`GRANT ${group} TO "${role}"`);
      const url = new URL(process.env.DATABASE_URL!); url.username = role; url.password = password; url.searchParams.set("connection_limit", "5");
      const client = new PrismaClient({ datasources: { db: { url: url.toString() } } }); clients.push(client);
      if (pool === "auth") auth = client; else if (pool === "runtime") runtime = client; else jobs = client;
    }
    service = makeService();
  });
  afterAll(async () => {
    for (const client of clients) await client.$disconnect();
    if (safe) {
      await root.user.deleteMany({ where: { id: { in: users } } });
      for (const role of roles) await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${role}"`);
    }
    await root.$disconnect();
  });
  async function human(platform?: "admin" | "desenvolvedor") {
    const user = await root.user.create({ data: { email: `${prefix}-${randomUUID()}@sintetico.example.test`, name: prefix, status: "active", credential: { create: { passwordHash: PROOF.credentialHash } } } }); users.push(user.id);
    if (platform) {
      const keys = platform === "desenvolvedor" ? ["admin", "desenvolvedor"] : ["admin"];
      for (const key of keys) { const role = await root.role.upsert({ where: { key }, create: { key, name: key }, update: {} }); await root.userPlatformRole.create({ data: { userId: user.id, roleId: role.id } }); }
    }
    const login = await service.beginLogin(user.id, { rememberMe: false }, PROOF);
    if ("requiresMfa" in login) throw new Error("unexpected challenge");
    return { user, hash: hashToken(login.token) };
  }
  async function enroll(platform?: "admin" | "desenvolvedor") {
    const base = await human(platform), setup = await service.setup(base.user.id, base.hash);
    const enabled = await service.enable(base.user.id, base.hash, totp(setup.secret, Date.now()));
    return { ...base, setup, codes: enabled.recoveryCodes };
  }
  it("mantém RLS e segredos somente no pool auth; boot inspector reconhece tabelas MFA", async () => {
    const original = process.env.RUN_RLS_INTEGRATION_TESTS; process.env.RUN_RLS_INTEGRATION_TESTS = "true";
    try { await validarPapelBanco(auth, "plugga_auth_runtime"); await validarPapelBanco(runtime, "plugga_runtime"); await validarPapelBanco(jobs, "plugga_jobs_runtime"); }
    finally { if (original === undefined) delete process.env.RUN_RLS_INTEGRATION_TESTS; else process.env.RUN_RLS_INTEGRATION_TESTS = original; }
    for (const client of [runtime, jobs]) { await expect(client.userMfa.findMany()).rejects.toThrow(); await expect(client.mfaChallenge.findMany()).rejects.toThrow(); }
    const flags = await root.$queryRaw<{ active: boolean; forced: boolean }[]>`SELECT relrowsecurity AS active, relforcerowsecurity AS forced FROM pg_class WHERE relname IN ('user_mfa','mfa_challenges')`;
    expect(flags).toHaveLength(2); expect(flags.every((f) => f.active && f.forced)).toBe(true);
  });
  it("backup concorrente consome uma vez, cria uma só sessão e audita login após MFA", async () => {
    const { user, codes } = await enroll();
    const primary = await service.beginLogin(user.id, { rememberMe: true }, PROOF);
    if (!("requiresMfa" in primary)) throw new Error("missing challenge");
    const results = await Promise.allSettled([service.verify(primary.pendingToken, codes[0]!, {}), service.verify(primary.pendingToken, codes[0]!, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await root.session.count({ where: { userId: user.id } })).toBe(2);
    expect((await root.userMfa.findUniqueOrThrow({ where: { userId: user.id } })).recoveryHashes).toHaveLength(9);
    expect(await root.eventLog.count({ where: { entityId: user.id, eventName: "auth.login.succeeded" } })).toBe(1);
  });
  it("TOTP usado e desafios expirados/esgotados não emitem sessão; tentativas persistem", async () => {
    const { user, setup, codes } = await enroll();
    const primary = await service.beginLogin(user.id, {}, PROOF); if (!("requiresMfa" in primary)) throw new Error("missing challenge");
    await expect(service.verify(primary.pendingToken, totp(setup.secret, Date.now()), {})).rejects.toThrow();
    for (let i = 1; i < 5; i++) await expect(service.verify(primary.pendingToken, "wrong-code", {})).rejects.toThrow();
    expect((await root.mfaChallenge.findUniqueOrThrow({ where: { tokenHash: hashToken(primary.pendingToken) } })).attempts).toBe(5);
    await expect(service.verify(primary.pendingToken, codes[0]!, {})).rejects.toThrow();
    const expired = await service.beginLogin(user.id, {}, PROOF); if (!("requiresMfa" in expired)) throw new Error("missing challenge");
    await root.mfaChallenge.update({ where: { tokenHash: hashToken(expired.pendingToken) }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await service.challenge(expired.pendingToken)).toEqual({ pending: false, expiresAt: null });
    await expect(service.verify(expired.pendingToken, codes[1]!, {})).rejects.toThrow();
    expect(await root.session.count({ where: { userId: user.id } })).toBe(1);
  });
  it("login sem MFA espera mesmo lock que ativação e observa fator ativo após commit", async () => {
    const { user } = await human();
    let release!: () => void, locked!: () => void, holderPid = 0;
    const gate = new Promise<void>((resolve) => { release = resolve; }), ready = new Promise<void>((resolve) => { locked = resolve; });
    const holder = root.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; holderPid = connection!.pid;
      locked(); await gate;
      await tx.userMfa.create({ data: { userId: user.id, revision: 1, encryptedSecret: new MfaCrypto(KEY).encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", user.id) } });
      await tx.session.deleteMany({ where: { userId: user.id } });
    }, { timeout: 15_000 });
    await ready;
    let settled = false;
    const login = service.beginLogin(user.id, {}, PROOF).finally(() => { settled = true; });
    let blocked = false;
    try {
      const deadline = Date.now() + 5_000;
      while (!blocked && !settled && Date.now() < deadline) {
        const [state] = await root.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.usename = ${roles.find((r) => r.endsWith("_auth"))!} AND ${holderPid} = ANY(pg_blocking_pids(a.pid))) AS blocked`;
        blocked = state!.blocked;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked, "The login query must actually wait on the user row lock before enrollment commits").toBe(true);
      expect(settled).toBe(false);
    } finally { release(); await holder; }
    expect(await login).toHaveProperty("requiresMfa", true);
    expect(await root.session.count({ where: { userId: user.id } })).toBe(0);
  });
  it("factorchange impede desafio em voo, revalida sessão atual e revoga outras", async () => {
    const { user, hash, codes } = await enroll();
    const pending = await service.beginLogin(user.id, {}, PROOF); if (!("requiresMfa" in pending)) throw new Error("missing challenge");
    const full = await service.verify(pending.pendingToken, codes[0]!, {});
    const stale = await service.beginLogin(user.id, {}, PROOF); if (!("requiresMfa" in stale)) throw new Error("missing challenge");
    await service.recoveryCodes(user.id, hash);
    await expect(service.verify(stale.pendingToken, codes[1]!, {})).rejects.toThrow();
    expect(await root.session.findUnique({ where: { tokenHash: hashToken(full.token) } })).toBeNull();
    expect((await service.status(user.id, hash)).recentlyVerified).toBe(true);
  });
  it("rollback de auditoria desfaz consumo, fator e revogação", async () => {
    const { user, hash, codes } = await enroll();
    const failing = makeService({ append: async () => { throw new Error("synthetic audit failure"); } } as AuditAppender);
    await expect(failing.disable(user.id, hash)).rejects.toThrow();
    expect((await service.status(user.id, hash)).enabled).toBe(true);
    const primary = await service.beginLogin(user.id, {}, PROOF); if (!("requiresMfa" in primary)) throw new Error("missing challenge");
    await expect(failing.verify(primary.pendingToken, codes[0]!, {})).rejects.toThrow();
    expect(await root.session.count({ where: { userId: user.id } })).toBe(1);
    expect((await root.userMfa.findUniqueOrThrow({ where: { userId: user.id } })).recoveryHashes).toHaveLength(10);
    await expect(service.verify(primary.pendingToken, codes[0]!, {})).resolves.toHaveProperty("token");
  });
  it("remoção Dev exige fator próprio ativo recente e alcança outra conta Dev; emergência audita", async () => {
    const actor = await enroll("desenvolvedor"), target = await enroll("desenvolvedor"), admin = await enroll("admin");
    await expect(service.remove(admin.user.id, admin.hash, target.user.id, "Solicitação sintética")).rejects.toThrow("Desenvolvedor");
    await root.session.update({ where: { tokenHash: actor.hash }, data: { mfaVerifiedAt: new Date(Date.now() - 301_000) } });
    await expect(service.remove(actor.user.id, actor.hash, target.user.id, "Solicitação sintética")).rejects.toThrow("Confirme");
    await service.confirm(actor.user.id, actor.hash, actor.codes[0]!);
    await service.remove(actor.user.id, actor.hash, target.user.id, "Solicitação sintética");
    expect(await root.session.count({ where: { userId: target.user.id } })).toBe(0);
    expect(await root.eventLog.count({ where: { entityId: target.user.id, eventName: "auth.mfa.removed", actorId: actor.user.id } })).toBe(1);
    await service.emergencyRemove(actor.user.id, "Procedimento sintético autorizado", "AUTORIZADO_PELO_ANDRE");
    expect(await root.session.count({ where: { userId: actor.user.id } })).toBe(0);
    expect(await root.eventLog.count({ where: { entityId: actor.user.id, eventName: "auth.mfa.emergency_removed" } })).toBe(1);
  });
  it("conta ativa sem chave/cifra inválida falha fechada; não protegida continua entrando", async () => {
    const protectedUser = await enroll();
    const noKey = new MfaService(new PrismaMfaRepository(auth as PrismaAuthService, new AuditAppender()), new ConfigService({ MFA_ENCRYPTION_KEY: "" }), new NullSessionCache());
    await expect(noKey.beginLogin(protectedUser.user.id, {}, PROOF)).rejects.toThrow("indisponível");
    await root.userMfa.update({ where: { userId: protectedUser.user.id }, data: { encryptedSecret: "corrupt" } });
    await expect(service.beginLogin(protectedUser.user.id, {}, PROOF)).rejects.toThrow("indisponível");
    const plain = await human();
    await expect(noKey.beginLogin(plain.user.id, {}, PROOF)).resolves.toHaveProperty("token");
  });
  it("reset de senha preserva fator, revoga tudo e recusa prova primária anterior em voo", async () => {
    const { user } = await enroll();
    const primary = await service.beginLogin(user.id, {}, PROOF); if (!("requiresMfa" in primary)) throw new Error("missing challenge");
    const before = await root.userMfa.findUniqueOrThrow({ where: { userId: user.id } });
    const reset = await root.authToken.create({ data: { userId: user.id, type: "reset", tokenHash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 300_000) } });
    await new PrismaAuthRepository(auth as PrismaAuthService, new AuditAppender()).consumeTokenAndSetPassword(reset.id, user.id, "new-hash-after-reset", new Date(), { activateUser: false, revokeSessions: true });
    const after = await root.userMfa.findUniqueOrThrow({ where: { userId: user.id } });
    expect(after.encryptedSecret).toBe(before.encryptedSecret);
    expect(after.recoveryHashes).toEqual(before.recoveryHashes);
    expect(after.revision).toBe(before.revision + 1);
    expect(await root.mfaChallenge.count({ where: { userId: user.id } })).toBe(0);
    expect(await root.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(service.beginLogin(user.id, {}, PROOF)).rejects.toThrow();
    await expect(service.beginLogin(user.id, {}, { method: "password", credentialHash: "new-hash-after-reset" })).resolves.toHaveProperty("requiresMfa", true);
  });
  it("readmissão limpa fator e desafios do vínculo removido junto com credenciais", async () => {
    const { user } = await enroll();
    await service.beginLogin(user.id, {}, PROOF);
    await root.user.update({ where: { id: user.id }, data: { status: "removed" } });
    const invited = await new PrismaAuthRepository(auth as PrismaAuthService, new AuditAppender()).createInvitedMember({ email: user.email, name: prefix, acesso: { plataforma: null, departamentos: [] } });
    expect(invited.id).toBe(user.id); expect(invited.status).toBe("invited");
    expect(await root.userMfa.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await root.mfaChallenge.count({ where: { userId: user.id } })).toBe(0);
    expect(await root.userCredential.findUnique({ where: { userId: user.id } })).toBeNull();
  });
  it("recupera alvo humano disabled/invited sem reativar e recusa removed/agente IA", async () => {
    const actor = await enroll("desenvolvedor");
    for (const status of ["disabled", "invited"]) {
      const target = await enroll();
      await root.user.update({ where: { id: target.user.id }, data: { status } });
      await service.remove(actor.user.id, actor.hash, target.user.id, "Recuperação sintética de conta");
      expect((await root.user.findUniqueOrThrow({ where: { id: target.user.id } })).status).toBe(status);
      expect((await root.userMfa.findUniqueOrThrow({ where: { userId: target.user.id } })).encryptedSecret).toBeNull();
      expect(await root.session.count({ where: { userId: target.user.id } })).toBe(0);
    }
    const removed = await enroll();
    await root.user.update({ where: { id: removed.user.id }, data: { status: "removed" } });
    await expect(service.remove(actor.user.id, actor.hash, removed.user.id, "Recuperação sintética de conta")).rejects.toThrow();
    const agent = await root.user.create({ data: { email: `${prefix}-${randomUUID()}@agente.sintetico.test`, name: prefix,
      departamentos: { create: { departamento: "crm", nivel: "membro", telas: [] } }, agentIdentity: { create: { departamento: "crm" } } } }); users.push(agent.id);
    await expect(service.remove(actor.user.id, actor.hash, agent.id, "Recuperação sintética de conta")).rejects.toThrow();
    await expect(service.emergencyRemove(agent.id, "Recuperação sintética de conta", "AUTORIZADO_PELO_ANDRE")).rejects.toThrow();
    await expect(service.beginLogin(agent.id, {}, PROOF)).rejects.toThrow();
    expect(await root.userMfa.findUnique({ where: { userId: agent.id } })).toBeNull();
  });
});
