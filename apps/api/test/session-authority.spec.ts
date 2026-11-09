import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../src/auth/auth.service";
import type { AuthRepository } from "../src/auth/auth.repository";
import { SessionService } from "../src/auth/session.service";
import { PrismaSessionLookupRepository } from "../src/core/auth/prisma-session-lookup.repository";
import type { SessionCache, SessionCacheEntry } from "../src/core/auth/session-cache";

const now = new Date("2026-10-29T12:00:00Z");
const user = {
  id: "00000000-0000-4000-8000-000000000001", email: "test@plugga.local", name: "Teste",
  status: "active", acesso: { plataforma: "admin" as const, departamentos: [] },
};
const principal = { id: user.id, kind: "user" as const, acesso: user.acesso };

function setup() {
  const session = {
    id: "s1", userId: user.id, expiresAt: new Date(now.getTime() + 30_000),
    absoluteExpiresAt: new Date(now.getTime() + 120_000), lastUsedAt: now,
    user: { ...user, platformRoles: [{ role: { key: "admin" } }], departamentos: [] },
  };
  const state: { session: typeof session | null; entry: SessionCacheEntry | null } = {
    session, entry: { user },
  };
  const cache = {
    get: vi.fn(async () => state.entry),
    set: vi.fn<SessionCache["set"]>(async (_hash, _userId, entry) => {
      state.entry = entry;
    }),
    invalidate: vi.fn(async () => { state.entry = null; }),
    invalidateAllForUser: vi.fn(async () => { state.entry = null; }),
  };
  const prisma = { session: {
    findUnique: vi.fn(async () => state.session && structuredClone(state.session)),
    delete: vi.fn(async () => { state.session = null; }),
    updateMany: vi.fn(async (input: { data: { lastUsedAt: Date; expiresAt: Date } }) => {
      if (!state.session) return { count: 0 };
      Object.assign(state.session, input.data);
      return { count: 1 };
    }),
  } };
  const config = new ConfigService({ SESSION_CACHE_TTL_SECONDS: 60 });
  const lookup = new PrismaSessionLookupRepository(prisma as never, config, cache);
  const repository = {
    deleteSessionByTokenHash: vi.fn(async () => { state.session = null; }),
    deleteSessionsForUser: vi.fn(async () => { state.session = null; }),
    findUserById: vi.fn(async () => ({ ...user, acesso: { plataforma: null, departamentos: [] } })),
    createSession: vi.fn<AuthRepository["createSession"]>(async () => undefined),
  };
  const sessions = new SessionService(repository as never, config, cache);
  return { state, session, cache, prisma, config, lookup, repository, sessions };
}

afterEach(() => vi.useRealTimers());

describe("o banco permanece autoridade sobre snapshots de sessão", () => {
  it.each(["expiresAt", "absoluteExpiresAt"] as const)("recusa cache quando %s expirou", async (field) => {
    const { session, lookup } = setup();
    session[field] = now;
    expect(await lookup.resolvePrincipal("hash", { now })).toBeNull();
  });

  it("recusa usuário desativado mesmo com cache ativo", async () => {
    const { session, lookup } = setup();
    session.user.status = "disabled";
    expect(await lookup.resolvePrincipal("hash", { now })).toBeNull();
  });

  it("usa o acesso rebaixado mesmo quando a invalidação Redis falha", async () => {
    const { session, cache, lookup } = setup();
    cache.invalidateAllForUser.mockImplementation(async () => undefined);
    session.user.platformRoles = [];
    await cache.invalidateAllForUser();
    expect(await lookup.resolvePrincipal("hash", { now })).toEqual({
      ...principal, acesso: { plataforma: null, departamentos: [] },
    });
  });

  it("reset revoga a sessão mesmo quando Redis conserva a entrada antiga", async () => {
    const { sessions, cache, lookup } = setup();
    cache.invalidateAllForUser.mockImplementation(async () => undefined);
    await sessions.revokeAllForUser(user.id);
    expect(await lookup.resolvePrincipal("hash", { now })).toBeNull();
  });

  it("logout durante renovação não autoriza nem repovoa o cache", async () => {
    const { state, session, prisma, sessions, lookup, cache } = setup();
    state.entry = null;
    session.lastUsedAt = new Date(now.getTime() - 600_000);
    prisma.session.updateMany.mockImplementation(async () => {
      await sessions.revoke("raw");
      return { count: 0 };
    });
    expect(await lookup.resolvePrincipal("hash", { now })).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("entrada repovoada por lookup em voo após logout não ressuscita a sessão", async () => {
    const { state, lookup, cache, sessions } = setup();
    state.entry = null;
    let release!: () => void;
    let started!: () => void;
    const writing = new Promise<void>((resolve) => { started = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    cache.set.mockImplementationOnce(async (_hash, _id, entry) => {
      started();
      await resume;
      state.entry = entry;
    });
    const pending = lookup.resolvePrincipal("hash", { now });
    await writing;
    await sessions.revoke("raw");
    release();
    await pending;
    expect(state.entry).not.toBeNull();
    expect(await lookup.resolvePrincipal("hash", { now })).toBeNull();
  });

  it("limita TTL do snapshot ao tempo restante da sessão", async () => {
    const { state, lookup, cache } = setup();
    state.entry = null;
    await lookup.resolvePrincipal("hash", { now });
    expect(cache.set.mock.calls[0]?.[3]).toBe(30);
  });

  it("limita TTL do snapshot à expiração absoluta menor que a deslizante", async () => {
    const { session, lookup, cache } = setup();
    session.absoluteExpiresAt = new Date(now.getTime() + 1_000);
    await lookup.resolvePrincipal("hash", { now });
    expect(cache.set.mock.calls[0]?.[3]).toBe(1);
  });

  it("autoriza pelo banco sem ler Redis, mesmo indisponível", async () => {
    const { lookup, cache } = setup();
    cache.get.mockRejectedValue(new Error("Redis indisponível"));
    expect(await lookup.resolvePrincipal("hash", { now })).toEqual(principal);
    expect(cache.get).not.toHaveBeenCalled();
  });

  it("não renova uma sessão apagada, vencida ou de usuário desativado", async () => {
    const { state, session, lookup, prisma } = setup();
    state.entry = null;
    session.lastUsedAt = new Date(now.getTime() - 600_000);
    await lookup.resolvePrincipal("hash", { now });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: session.id, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now }, user: { status: "active" } },
    }));
  });

  it("login limita o TTL do snapshot à expiração deslizante", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { sessions, config, cache } = setup();
    config.set("SESSION_CACHE_TTL_SECONDS", 3_600);
    config.set("SESSION_ABSOLUTE_TTL_HOURS", 1);
    config.set("SESSION_TTL_MINUTES", 1);
    await sessions.issue(user, {});
    expect(cache.set.mock.calls[0]?.[3]).toBe(60);
  });

  it("/me retorna o acesso atual do banco mesmo com perfil antigo cacheado", async () => {
    const { repository } = setup();
    const auth = new AuthService(repository as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    expect((await auth.me(principal)).acesso.plataforma).toBeNull();
  });

  it("/me recusa usuário desativado depois do guard", async () => {
    const { repository } = setup();
    repository.findUserById.mockResolvedValue({ ...user, status: "disabled", acesso: { plataforma: null, departamentos: [] } });
    const auth = new AuthService(repository as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(auth.me(principal)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("PLU-311: prazos fixos e compatibilidade com sessões legadas", () => {
  const hour = 3_600_000;

  it.each([true, false])("emite prazo fixo independente da configuração legada (rememberMe=%s)", async (rememberMe) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { sessions, repository, config } = setup();
    config.set("SESSION_TTL_MINUTES", 1);
    config.set("SESSION_ABSOLUTE_TTL_HOURS", 1);
    await sessions.issue(user, { rememberMe });
    const created = repository.createSession.mock.calls[0]?.[0];
    const deadline = new Date(now.getTime() + (rememberMe ? 7 * 24 * hour : 12 * hour));
    expect(created).toMatchObject({ expiresAt: deadline, absoluteExpiresAt: deadline });
  });

  it.each([7 * 24, 12])("preserva prazo fixo de %sh após inatividade e atividade sucessiva", async (hours) => {
    const { session, lookup, config, cache } = setup();
    const deadline = new Date(now.getTime() + hours * hour);
    session.expiresAt = deadline;
    session.absoluteExpiresAt = deadline;
    config.set("SESSION_TTL_MINUTES", 1);
    // O primeiro uso lembrado só acontece dias depois do login; o curto, horas depois.
    const firstUse = new Date(now.getTime() + (hours === 12 ? 10 : 5 * 24) * hour);
    expect(await lookup.resolvePrincipal("hash", { now: firstUse })).toEqual(principal);
    expect(session.expiresAt).toEqual(deadline);
    expect(await lookup.resolvePrincipal("hash", { now: new Date(deadline.getTime() - 1_000) })).toEqual(principal);
    expect(session.expiresAt).toEqual(deadline);
    expect(cache.set.mock.calls.at(-1)?.[3]).toBe(1);
    expect(await lookup.resolvePrincipal("hash", { now: deadline })).toBeNull();
  });

  it("emissão interna sem preferência mantém os dois prazos legados", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { sessions, repository, config } = setup();
    config.set("SESSION_TTL_MINUTES", 20);
    config.set("SESSION_ABSOLUTE_TTL_HOURS", 48);
    await sessions.issue(user, {});
    expect(repository.createSession.mock.calls[0]?.[0]).toMatchObject({
      expiresAt: new Date(now.getTime() + 20 * 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 48 * hour),
    });
  });

  it.each([45, 120])("sessão legada continua deslizando até o teto individual de %ss", async (absoluteSeconds) => {
    const { session, lookup, config } = setup();
    session.lastUsedAt = new Date(now.getTime() - 600_000);
    session.absoluteExpiresAt = new Date(now.getTime() + absoluteSeconds * 1_000);
    config.set("SESSION_TTL_MINUTES", 1);
    expect(await lookup.resolvePrincipal("hash", { now })).toEqual(principal);
    expect(session.expiresAt).toEqual(new Date(now.getTime() + Math.min(60, absoluteSeconds) * 1_000));
  });

  it("sessão legada que já chegou ao teto absoluto conserva esse teto", async () => {
    const { session, lookup, config } = setup();
    const deadline = new Date(now.getTime() + hour);
    session.lastUsedAt = new Date(now.getTime() - 600_000);
    session.expiresAt = deadline;
    session.absoluteExpiresAt = deadline;
    config.set("SESSION_TTL_MINUTES", 1);
    expect(await lookup.resolvePrincipal("hash", { now })).toEqual(principal);
    expect(session.expiresAt).toEqual(deadline);
  });

  it.each([7 * 24, 12])("logout durante atualização da sessão fixa de %sh impede autorização e cache", async (hours) => {
    const { session, lookup, sessions, prisma, cache } = setup();
    session.expiresAt = session.absoluteExpiresAt = new Date(now.getTime() + hours * hour);
    session.lastUsedAt = new Date(now.getTime() - 600_000);
    prisma.session.updateMany.mockImplementation(async () => {
      await sessions.revoke("raw");
      return { count: 0 };
    });
    expect(await lookup.resolvePrincipal("hash", { now })).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
