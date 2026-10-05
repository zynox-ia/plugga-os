import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { INestApplication } from "@nestjs/common";
import { DiscoveryModule, DiscoveryService, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { listarRotas, type RotaDoInventario } from "../src/core/auth/inventario-rotas";

const ARQUIVO = path.resolve(__dirname, "../../../specs/002-fundacao-solida/contracts/inventario-rotas.json");

/**
 * Inventário de rotas (spec 002, US5, FR-020/021/023). Sobe a aplicação, lista
 * toda rota HTTP com como ela declara o acesso e compara com o arquivo
 * versionado. Rota nova ou alterada faz o teste falhar até o arquivo ser
 * regenerado e revisado (CODEOWNERS cobre o arquivo):
 *
 *   ATUALIZA_INVENTARIO=1 pnpm --filter @plugga/api test -- inventario-rotas
 */
describe("inventário de rotas (e2e)", () => {
  let app: INestApplication;
  let rotas: RotaDoInventario[];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    rotas = listarRotas(app.get(DiscoveryService), app.get(Reflector));
  });

  afterAll(async () => {
    await app.close();
  });

  it("encontra as rotas e não repete método e caminho", () => {
    expect(rotas.length).toBeGreaterThan(100);
    const chaves = rotas.map((r) => `${r.metodo} ${r.caminho}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("cada rota tem um acesso do conjunto conhecido", () => {
    for (const r of rotas) {
      expect(["public", "authenticated", "roles", "permissions", "undeclared"], `${r.metodo} ${r.caminho}`).toContain(
        r.acesso,
      );
    }
  });

  it("confere com o inventário versionado (ATUALIZA_INVENTARIO=1 regenera)", () => {
    const atual = `${JSON.stringify(rotas, null, 2)}\n`;
    if (process.env.ATUALIZA_INVENTARIO === "1") {
      mkdirSync(path.dirname(ARQUIVO), { recursive: true });
      writeFileSync(ARQUIVO, atual);
    }
    const versionado = readFileSync(ARQUIVO, "utf8");
    expect(JSON.parse(atual), "o inventário de rotas mudou: regenere com ATUALIZA_INVENTARIO=1 e revise").toEqual(
      JSON.parse(versionado),
    );
  });
});
