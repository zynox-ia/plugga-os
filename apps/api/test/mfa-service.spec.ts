import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStore } from "./support/in-memory-auth";
import { InMemoryMfaRepository } from "./support/in-memory-mfa";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { hashToken } from "../src/core/auth/token.util";
import { MfaService } from "../src/auth/mfa.service";
import { totp } from "../src/auth/mfa-crypto";

describe("MFA optional, single-use e mutações atômicas", () => {
  let store: InMemoryStore, repo: InMemoryMfaRepository, service: MfaService;
  beforeEach(() => {
    vi.useRealTimers(); store = new InMemoryStore(); repo = new InMemoryMfaRepository(store);
    service = new MfaService(repo, new ConfigService({ MFA_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString("base64") }), new NullSessionCache());
  });
  async function enroll() {
    const user = await store.addUser({ email: "human@plugga.local" });
    store.credentials.set(user.id, "synthetic-hash");
    const login = await service.beginLogin(user.id, { rememberMe: false }, { method: "password", credentialHash: "synthetic-hash" });
    if ("requiresMfa" in login) throw new Error("unexpected challenge");
    const hash = hashToken(login.token);
    const setup = await service.setup(user.id, hash);
    expect((await service.status(user.id, hash)).enabled).toBe(false);
    const { recoveryCodes } = await service.enable(user.id, hash, totp(setup.secret, Date.now()));
    return { user, hash, setup, recoveryCodes };
  }
  it("abandonar setup preserva login sem MFA; enable revoga outras sessões", async () => {
    const { user, hash } = await enroll();
    expect(store.sessions.size).toBe(1);
    expect((await service.status(user.id, hash)).enabled).toBe(true);
    const result = await service.beginLogin(user.id, { rememberMe: true }, { method: "password", credentialHash: "synthetic-hash" });
    expect(result).toHaveProperty("requiresMfa", true);
    expect(store.sessions.size).toBe(1);
  });
  it("backup concorrente consome desafio e cria uma só sessão fixed7d", async () => {
    const { user, recoveryCodes } = await enroll();
    const pending = await service.beginLogin(user.id, { rememberMe: true }, { method: "password", credentialHash: "synthetic-hash" });
    if (!("requiresMfa" in pending)) throw new Error("missing challenge");
    const results = await Promise.allSettled([service.verify(pending.pendingToken, recoveryCodes[0]!, {}), service.verify(pending.pendingToken, recoveryCodes[0]!, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const session = [...store.sessions.values()].at(-1)!;
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(604_790_000);
    expect((await service.status(user.id, "invalid").catch(() => null))).toBeNull();
    expect(repo.factors.get(user.id)!.recoveryHashes).toHaveLength(9);
  });
  it("TOTP usado em enable não pode ser repetido no login", async () => {
    const { user, setup } = await enroll();
    const pending = await service.beginLogin(user.id, {}, { method: "password", credentialHash: "synthetic-hash" });
    if (!("requiresMfa" in pending)) throw new Error("missing challenge");
    await expect(service.verify(pending.pendingToken, totp(setup.secret, Date.now()), {})).rejects.toThrow();
    expect(repo.challenges.values().next().value?.attempts).toBe(1);
  });
  it("cinco erros esgotam desafio e permanecem após a recusa", async () => {
    const { user, recoveryCodes } = await enroll();
    const pending = await service.beginLogin(user.id, {}, { method: "password", credentialHash: "synthetic-hash" });
    if (!("requiresMfa" in pending)) throw new Error("missing challenge");
    for (let i = 0; i < 5; i++) await expect(service.verify(pending.pendingToken, "wrong-code", {})).rejects.toThrow();
    await expect(service.verify(pending.pendingToken, recoveryCodes[0]!, {})).rejects.toThrow();
  });
  it("ações exigem fator recente, revogam outras sessões e invalidam challenges", async () => {
    const { user, hash, recoveryCodes } = await enroll();
    const pending = await service.beginLogin(user.id, {}, { method: "password", credentialHash: "synthetic-hash" });
    if (!("requiresMfa" in pending)) throw new Error("missing challenge");
    store.sessions.get(hash)!.mfaVerifiedAt = new Date(Date.now() - 301_000);
    await expect(service.disable(user.id, hash)).rejects.toThrow("Confirme");
    await service.confirm(user.id, hash, recoveryCodes[0]!);
    await service.disable(user.id, hash);
    expect(repo.challenges.size).toBe(0);
    expect((await service.status(user.id, hash)).enabled).toBe(false);
  });
  it("falha auditoria desfaz mutação, consumo e revogação", async () => {
    const { user, hash } = await enroll();
    repo.failAudit = true;
    await expect(service.disable(user.id, hash)).rejects.toThrow("audit unavailable");
    expect((await service.status(user.id, hash)).enabled).toBe(true);
    expect(store.sessions.has(hash)).toBe(true);
  });
  it("sem chave login desprotegido funciona e setup falha fechado", async () => {
    const user = await store.addUser({ email: "unprotected@plugga.local" });
    const noKey = new MfaService(repo, new ConfigService({ MFA_ENCRYPTION_KEY: "" }), new NullSessionCache());
    store.credentials.set(user.id, "synthetic-hash");
    const login = await noKey.beginLogin(user.id, {}, { method: "password", credentialHash: "synthetic-hash" });
    if ("requiresMfa" in login) throw new Error("unexpected challenge");
    await expect(noKey.setup(user.id, hashToken(login.token))).rejects.toThrow("indisponível");
  });
  it("regenerar backups preserva a hora da confirmação e não prorroga a janela", async () => {
    const { user, hash } = await enroll();
    const confirmed = new Date(Date.now() - 240_000);
    store.sessions.get(hash)!.mfaVerifiedAt = confirmed;
    await service.recoveryCodes(user.id, hash);
    expect(store.sessions.get(hash)!.mfaVerifiedAt).toEqual(confirmed);
    store.sessions.get(hash)!.mfaVerifiedAt = new Date(Date.now() - 301_000);
    await expect(service.recoveryCodes(user.id, hash)).rejects.toThrow("Confirme");
  });
  it("revalida versão da senha provada sob lock antes de emitir sessão", async () => {
    const user = await store.addUser({ email: "password-version@plugga.local" });
    store.credentials.set(user.id, "new-hash-after-reset");
    await expect(service.beginLogin(user.id, {}, { method: "password", credentialHash: "old-hash" })).rejects.toThrow();
    expect(store.sessions.size).toBe(0);
  });
  it("somente Desenvolvedor com próprio fator ativo recente remove outra conta; audita e revoga tudo", async () => {
    const target = await enroll(), actor = await enroll();
    actor.user.acesso.plataforma = "admin";
    await expect(service.remove(actor.user.id, actor.hash, target.user.id, "Solicitação sintética")).rejects.toThrow("Desenvolvedor");
    actor.user.acesso.plataforma = "desenvolvedor";
    store.sessions.get(actor.hash)!.mfaVerifiedAt = new Date(Date.now() - 301_000);
    await expect(service.remove(actor.user.id, actor.hash, target.user.id, "Solicitação sintética")).rejects.toThrow("Confirme");
    await service.confirm(actor.user.id, actor.hash, actor.recoveryCodes[0]!);
    const pending = await service.beginLogin(target.user.id, {}, { method: "password", credentialHash: "synthetic-hash" });
    expect(pending).toHaveProperty("requiresMfa");
    await service.remove(actor.user.id, actor.hash, target.user.id, "Solicitação sintética");
    expect(repo.factors.get(target.user.id)!.encryptedSecret).toBeNull();
    expect([...store.sessions.values()].some((s) => s.userId === target.user.id)).toBe(false);
    expect(repo.challenges.size).toBe(0);
    expect(repo.events.at(-1)).toMatchObject({ eventName: "auth.mfa.removed", actorId: actor.user.id });
    expect(store.sessions.has(actor.hash)).toBe(true);
  });
  it("emergência requer confirmação operacional explícita e desfaz tudo se audit falhar", async () => {
    const { user, hash } = await enroll();
    await expect(service.emergencyRemove(user.id, "Solicitação sintética", "NO")).rejects.toThrow();
    repo.failAudit = true;
    await expect(service.emergencyRemove(user.id, "Solicitação sintética", "AUTORIZADO_PELO_ANDRE")).rejects.toThrow();
    expect(store.sessions.has(hash)).toBe(true);
    repo.failAudit = false;
    await service.emergencyRemove(user.id, "Solicitação sintética", "AUTORIZADO_PELO_ANDRE");
    expect(store.sessions.has(hash)).toBe(false);
    expect(repo.events.at(-1)?.eventName).toBe("auth.mfa.emergency_removed");
  });
});
