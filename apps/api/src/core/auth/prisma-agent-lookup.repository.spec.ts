import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PrismaAgentLookupRepository } from "./prisma-agent-lookup.repository";
import { PrismaAuthService } from "../../prisma/prisma-auth.service";

const agora = new Date();
const base = () => ({ userId: "00000000-0000-4000-8000-000000000011", departamento: "crm", revokedAt: null as Date | null,
  credentialExpiresAt: new Date(agora.getTime() + 60_000), user: { id: "00000000-0000-4000-8000-000000000011", status: "active", platformRoles: [] as Array<{ role: { key: string } }>, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } });

describe("lookup de identidade de IA", () => {
  it("devolve o User próprio e o acesso atual, sem credencial no resultado", async () => {
    const identidade = base();
    const db = { agentIdentity: { findUnique: async () => identidade } };
    const repo = new PrismaAgentLookupRepository(db as unknown as PrismaAuthService);
    const resultado = await repo.resolvePrincipal(randomBytes(32).toString("hex"), agora);
    expect(resultado).toEqual({ id: identidade.userId, kind: "service", acesso: { plataforma: null, departamentos: identidade.user.departamentos } });
    identidade.user.departamentos[0]!.telas = [];
    expect((await repo.resolvePrincipal(randomBytes(32).toString("hex"), agora))?.acesso.departamentos[0]?.telas).toEqual([]);
  });

  it("recusa credencial expirada/revogada, usuário inativo e vínculo incoerente", async () => {
    const alteracoes = [
      (i: ReturnType<typeof base>) => { i.revokedAt = agora; },
      (i: ReturnType<typeof base>) => { i.credentialExpiresAt = agora; },
      (i: ReturnType<typeof base>) => { i.user.status = "disabled"; },
      (i: ReturnType<typeof base>) => { i.user.platformRoles = [{ role: { key: "admin" } }]; },
      (i: ReturnType<typeof base>) => { i.user.departamentos[0]!.nivel = "gerente"; },
      (i: ReturnType<typeof base>) => { i.departamento = "financeiro"; },
      (i: ReturnType<typeof base>) => { i.user.departamentos.push({ departamento: "financeiro", nivel: "membro", telas: [] }); },
    ];
    for (const alterar of alteracoes) {
      const identidade = base();
      alterar(identidade);
      const db = { agentIdentity: { findUnique: async () => identidade } };
      const repo = new PrismaAgentLookupRepository(db as unknown as PrismaAuthService);
      expect(await repo.resolvePrincipal(randomBytes(32).toString("hex"), agora)).toBeNull();
    }
  });
});
