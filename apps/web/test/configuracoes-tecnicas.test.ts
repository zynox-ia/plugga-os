import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { podeAbrirPagina } from "../app/lib/acesso-paginas.ts";

test("links do painel t\u00e9cnico levam a telas existentes e autorizadas", () => {
  const codigo = readFileSync(new URL("../app/configuracoes/desenvolvedor-view.tsx", import.meta.url), "utf8");
  const links = [...codigo.matchAll(/href="(\/[^"]+)"/g)].map((match) => match[1]!);
  // Hoje a tela não tem link nenhum; a regra vale para qualquer um que voltar a existir.
  for (const caminho of links) {
    assert.equal(existsSync(new URL(`../app${caminho}/page.tsx`, import.meta.url)), true, caminho);
    assert.equal(podeAbrirPagina({ plataforma: "desenvolvedor", departamentos: [] }, caminho), true, caminho);
  }
});
