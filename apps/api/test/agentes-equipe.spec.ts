import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import type { Acesso, CriacaoDeAgente } from "@plugga/shared";
import { describe, expect, it, vi } from "vitest";

import { AgentesEquipeService } from "../src/auth/agentes-equipe.service";
import { AgentesRepository } from "../src/auth/agentes.repository";
import { AuthTokenIssuer } from "../src/auth/auth-token-issuer.service";
import type { AuthUserRecord } from "../src/auth/auth.repository";
import { EquipeService } from "../src/auth/equipe.service";
import { ResetEmailHandler } from "../src/auth/reset-email.handler";
import { SessionService } from "../src/auth/session.service";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { hashToken } from "../src/core/auth/token.util";
import { CapturingEmailPort, InMemoryAuthRepository, InMemoryStore, NoopAuditRepository } from "./support/in-memory-auth";

const CRM: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.clientes", "crm.pipelines"] }] };
const input: CriacaoDeAgente = { name: "Agente sintético", departamento: "crm", telas: ["crm.pipelines"] };

async function preparar() {
  const store = new InMemoryStore();
  const auth = new InMemoryAuthRepository(store);
  const email = new CapturingEmailPort();
  const config = new ConfigService({ SESSION_CACHE_TTL_SECONDS: 0 });
  const tokens = new AuthTokenIssuer(auth, email, config);
  const cache = new NullSessionCache();
  const sessions = new SessionService(auth, config, cache);
  const audit = new NoopAuditRepository();
  const equipe = new EquipeService(auth, tokens, sessions, audit, cache);
  const gestor = await store.addUser({ email: `${randomUUID()}@sintetico.invalid`, acesso: CRM });
  const principal: AuthPrincipal = { id: gestor.id, kind: "user", acesso: CRM };
  const credenciais = new Map<string, string>();
  class Repositorio extends AgentesRepository {
    async criar(entrada: CriacaoDeAgente): Promise<AuthUserRecord> {
      return store.addUser({ email: `${randomUUID()}@agentes.plugga.invalid`, name: entrada.name, tipo: "agente_ia", acesso: {
        plataforma: null, departamentos: [{ departamento: entrada.departamento, nivel: "membro", telas: entrada.telas }],
      } });
    }
    async definirCredencial(userId: string, hash: string): Promise<void> { credenciais.set(userId, hash); }
    async revogarCredencial(userId: string): Promise<void> { credenciais.delete(userId); }
  }
  const service = new AgentesEquipeService(new Repositorio(), equipe);
  return { store, gestor, principal, service, equipe, credenciais, sessions, tokens, auth, email, audit };
}

describe("agentes como membros da equipe", () => {
  it("cria membro no departamento gerido, lista a identidade e não envia convite", async () => {
    const h = await preparar();
    const agente = await h.service.criar(h.principal, input);
    expect(agente.tipo).toBe("agente_ia");
    expect(agente.acesso).toEqual({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] });
    expect(agente.podeReenviarConvite).toBe(false);
    expect((await h.equipe.listar(h.principal, {})).membros.some((m) => m.id === agente.id && m.tipo === "agente_ia")).toBe(true);
    expect(h.email.sent).toHaveLength(0);
    expect(h.store.credentials.size).toBe(0);
  });

  it("nega criação para membro, outro departamento e tela que o gerente não possui", async () => {
    const h = await preparar();
    await expect(h.service.criar(h.principal, { ...input, departamento: "financeiro", telas: ["financeiro.receber"] })).rejects.toThrow();
    await expect(h.service.criar(h.principal, { ...input, telas: ["crm.contratos"] })).rejects.toThrow();
    h.gestor.acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] };
    await expect(h.service.criar(h.principal, input)).rejects.toThrow();
    expect(h.store.users.size).toBe(1);
  });

  it("emite uma vez, persiste somente hash, rotaciona e revoga sem expor na listagem", async () => {
    const h = await preparar();
    const agente = await h.service.criar(h.principal, input);
    const primeira = await h.service.emitirCredencial(h.principal, agente.id);
    const antigoHash = h.credenciais.get(agente.id);
    expect(antigoHash === hashToken(primeira.token)).toBe(true);
    const segunda = await h.service.emitirCredencial(h.principal, agente.id);
    expect(h.credenciais.get(agente.id) !== antigoHash).toBe(true);
    expect(h.credenciais.get(agente.id) === hashToken(segunda.token)).toBe(true);
    const lista = JSON.stringify(await h.equipe.listar(h.principal, {}));
    expect(lista.includes(primeira.token) || lista.includes(segunda.token) || lista.includes(antigoHash!)).toBe(false);
    await h.service.revogarCredencial(h.principal, agente.id);
    expect(h.credenciais.has(agente.id)).toBe(false);
  });

  it("nega gestão cruzada, autogestão por IA e elevação do agente a gerente/admin", async () => {
    const h = await preparar();
    const agente = await h.service.criar(h.principal, input);
    const outroGerente = await h.store.addUser({ email: `${randomUUID()}@sintetico.invalid`, acesso: { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: ["financeiro.receber"] }] } });
    await expect(h.service.emitirCredencial({ id: outroGerente.id, kind: "user", acesso: outroGerente.acesso }, agente.id)).rejects.toThrow();
    await expect(h.equipe.listar({ id: agente.id, kind: "service", acesso: agente.acesso }, {})).rejects.toThrow();
    h.gestor.acesso = { plataforma: "admin", departamentos: [] };
    await expect(h.equipe.editarAcesso(h.principal, agente.id, { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] })).rejects.toThrow();
    await expect(h.equipe.editarAcesso(h.principal, agente.id, { plataforma: "admin", departamentos: [] })).rejects.toThrow();
    await expect(h.equipe.reenviarConvite(h.principal, agente.id)).rejects.toThrow();
    expect(h.email.sent).toHaveLength(0);
  });

  it("identidade de IA não recebe cookie de pessoa, convite ou redefinição de senha", async () => {
    const h = await preparar();
    const agente = await h.service.criar(h.principal, input);
    const registro = (await h.auth.findUserById(agente.id))!;
    const emitir = vi.spyOn(h.auth, "createSession");
    await expect(h.sessions.issue(registro, {})).rejects.toThrow();
    await h.tokens.sendInvite(registro);
    await h.tokens.sendReset(registro);
    const handler = new ResetEmailHandler(h.auth, h.tokens, h.audit);
    await handler.process({ email: registro.email });
    expect(emitir).not.toHaveBeenCalled();
    expect(h.email.sent).toHaveLength(0);
    expect(h.store.tokens.size).toBe(0);
  });
});
