import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import type { AuthenticatedRequest } from "./auth.types";
import { DevHeaderAuthContext } from "./dev-header-auth-context";
import { mapAcesso } from "./user-access.mapper";

describe("mapAcesso", () => {
  const papel = (key: string) => ({ role: { key } });

  it("desenvolvedor prevalece sobre a linha admin que ele mantém na transição", () => {
    expect(mapAcesso({ platformRoles: [papel("admin"), papel("desenvolvedor")], departamentos: [] })).toEqual({
      plataforma: "desenvolvedor",
      departamentos: [],
    });
  });

  it("papel de plataforma ignora linhas de departamento", () => {
    expect(
      mapAcesso({ platformRoles: [papel("admin")], departamentos: [{ departamento: "crm", nivel: "membro" }] }),
    ).toEqual({ plataforma: "admin", departamentos: [] });
  });

  it("descarta linha fora do catálogo em vez de derrubar o login", () => {
    expect(
      mapAcesso({
        platformRoles: [],
        departamentos: [
          { departamento: "crm", nivel: "gerente" },
          { departamento: "comercial-clientes", nivel: "membro" },
          { departamento: "financeiro", nivel: "diretor" },
        ],
      }),
    ).toEqual({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] });
  });
});

describe("DevHeaderAuthContext com o acesso de 4 papéis", () => {
  const contexto = new DevHeaderAuthContext(new ConfigService({ DEV_AUTH_ENABLED: true }));
  const resolver = (headers: Record<string, string>) =>
    contexto.resolve({ headers: { "x-dev-principal": "u-1", ...headers } } as AuthenticatedRequest);

  it("lê plataforma e departamentos dos cabeçalhos", async () => {
    expect((await resolver({ "x-dev-plataforma": "desenvolvedor" }))?.acesso).toEqual({
      plataforma: "desenvolvedor",
      departamentos: [],
    });
    expect((await resolver({ "x-dev-departamentos": "crm, suprimentos:gerente" }))?.acesso).toEqual({
      plataforma: null,
      departamentos: [
        { departamento: "crm", nivel: "membro" },
        { departamento: "suprimentos", nivel: "gerente" },
      ],
    });
  });

  it("x-dev-roles: admin vale como admin, e valor desconhecido nunca promove", async () => {
    expect((await resolver({ "x-dev-roles": "admin" }))?.acesso?.plataforma).toBe("admin");
    expect((await resolver({ "x-dev-plataforma": "root", "x-dev-departamentos": "financeiro:dono" }))?.acesso).toEqual({
      plataforma: null,
      departamentos: [],
    });
  });
});
