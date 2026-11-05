import assert from "node:assert/strict";
import { it } from "node:test";

it("isola a prévia local dos testes e mantém o build de produção na pasta padrão", async () => {
  const variaveis = ["NODE_ENV", "DESIGN_SYSTEM_E2E", "PLUGGA_DEV_DIST_DIR"] as const;
  const anteriores = variaveis.map((nome) => process.env[nome]);
  const cenarios = [
    ["development", undefined, undefined, ".next-dev"],
    ["development", "true", undefined, ".next-ds"],
    ["development", undefined, "dist/clientes-3010", "dist/clientes-3010"],
    ["development", "true", "dist/clientes-3010", ".next-ds"],
    ["production", "true", "dist/clientes-3010", ".next"],
  ];

  try {
    for (const [indice, cenario] of cenarios.entries()) {
      variaveis.forEach((nome, i) => {
        const valor = cenario[i];
        if (valor === undefined) delete process.env[nome];
        else (process.env as Record<string, string>)[nome] = valor;
      });
      const { default: config } = await import(`../next.config.ts?dist-dir-${indice}`);
      assert.equal(config.distDir, cenario[3]);
    }
  } finally {
    variaveis.forEach((nome, i) => {
      const valor = anteriores[i];
      if (valor === undefined) delete process.env[nome];
      else (process.env as Record<string, string>)[nome] = valor;
    });
  }
});
