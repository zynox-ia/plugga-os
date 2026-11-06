import { randomBytes, randomUUID } from "node:crypto";

import type { CriacaoDeAgente } from "@plugga/shared";
import { describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaAuthService } from "../prisma/prisma-auth.service";
import { AgentesEquipeService } from "./agentes-equipe.service";
import { AuthRepository, type AuthUserRecord } from "./auth.repository";
import { EquipeService } from "./equipe.service";
import { PrismaAgentesRepository } from "./prisma-agentes.repository";

const input: CriacaoDeAgente = { name: "Agente sintético", departamento: "crm", telas: ["crm.pipelines"] };
const operacoes = ["criar", "rotacionar", "revogar"] as const;
type Operacao = (typeof operacoes)[number];

function preparar() {
  const ator: AuthUserRecord = { id: randomUUID(), name: "Gestor sintético", email: "gestor@sintetico.invalid", status: "active", createdAt: new Date(), tipo: "pessoa",
    acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] } };
  const alvo: AuthUserRecord = { ...ator, id: randomUUID(), tipo: "agente_ia", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } };
  const principal: AuthPrincipal = { id: ator.id, kind: "user", acesso: structuredClone(ator.acesso) };
  const registros = new Map([[ator.id, ator], [alvo.id, alvo]]);
  let antesDaTransacao = () => {};
  let escritas = 0;
  const bruto = (r: AuthUserRecord) => ({ ...r, departamentos: r.acesso.departamentos, platformRoles: r.acesso.plataforma ? [{ role: { key: r.acesso.plataforma } }] : [], agentIdentity: r.tipo === "agente_ia" ? { userId: r.id } : null });
  const tx = {
    $queryRaw: vi.fn(async () => [{ status: "active" }]),
    user: {
      findMany: vi.fn(async () => [...registros.values()].map(bruto)),
      create: vi.fn(async () => { escritas++; return bruto(alvo); }),
    },
    agentIdentity: { update: vi.fn(async () => { escritas++; }) },
  };
  const prisma = { $transaction: async <T>(fn: (banco: typeof tx) => Promise<T>) => { antesDaTransacao(); return fn(tx); } };
  const audit = { append: vi.fn(async () => {}) };
  const repository = new PrismaAgentesRepository(prisma as unknown as PrismaAuthService, audit as unknown as AuditAppender);
  const auth = { findUserById: async (id: string) => registros.get(id) ?? null };
  const equipe = new EquipeService(auth as unknown as AuthRepository, {} as never, {} as never, {} as never, {} as never);
  const service = new AgentesEquipeService(repository, equipe);
  return { ator, alvo, principal, repository, service, audit, tx,
    antes: (fn: () => void) => { antesDaTransacao = fn; },
    escritas: () => escritas,
  };
}

function operar(h: ReturnType<typeof preparar>, operacao: Operacao): Promise<unknown> {
  if (operacao === "criar") return h.service.criar(h.principal, input);
  if (operacao === "rotacionar") return h.service.emitirCredencial(h.principal, h.alvo.id);
  return h.service.revogarCredencial(h.principal, h.alvo.id);
}

describe("autorização atômica de identidades de IA", () => {
  for (const operacao of operacoes) {
    it(`${operacao}: gestão válida continua autorizada na transação`, async () => {
      const h = preparar();
      await operar(h, operacao);
      expect(h.escritas()).toBe(1);
      expect(h.audit.append).toHaveBeenCalledTimes(1);
      expect(h.tx.user.findMany).toHaveBeenCalledTimes(1);
    });

    it(`${operacao}: revogar gestão após a checagem inicial impede a escrita`, async () => {
      const h = preparar();
      h.antes(() => { h.ator.acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] }; });
      await expect(operar(h, operacao)).rejects.toBeInstanceOf(AcessoNegado);
      expect(h.escritas()).toBe(0);
      expect(h.audit.append).not.toHaveBeenCalled();
    });

    it(`${operacao}: desativar o ator após a checagem inicial impede a escrita`, async () => {
      const h = preparar();
      h.antes(() => { h.ator.status = "disabled"; });
      await expect(operar(h, operacao)).rejects.toBeInstanceOf(AcessoNegado);
      expect(h.escritas()).toBe(0);
      expect(h.audit.append).not.toHaveBeenCalled();
    });

    it(`${operacao}: revogar só a tela após a checagem inicial impede a escrita`, async () => {
      const h = preparar();
      h.antes(() => { h.ator.acesso.departamentos[0]!.telas = []; });
      await expect(operar(h, operacao)).rejects.toBeInstanceOf(AcessoNegado);
      expect(h.escritas()).toBe(0);
      expect(h.audit.append).not.toHaveBeenCalled();
    });
  }

  it("rotacionar diretamente pelo repositório também exige ator humano ativo", async () => {
    const h = preparar();
    h.ator.status = "disabled";
    const hash = randomBytes(32).toString("hex");
    await expect(h.repository.definirCredencial(h.alvo.id, hash, new Date(), h.principal)).rejects.toBeInstanceOf(AcessoNegado);
    expect(h.escritas()).toBe(0);
  });
});
