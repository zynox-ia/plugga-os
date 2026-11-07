import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const perfil = readFileSync(new URL("../app/configuracoes/perfil-view.tsx", import.meta.url), "utf8");

test("perfil sem API de edição não persiste foto nem simula gravação", () => {
  assert.doesNotMatch(perfil, /\b(localStorage|sessionStorage|FileReader|setTimeout|fetch)\b/);
  assert.doesNotMatch(perfil, /<form\b|type="file"|\bon(?:Submit|Change|Input|Click|Drop)=/);
  assert.doesNotMatch(perfil, /Perfil atualizado|Senha atualizada|salvas com sucesso/);
  assert.match(perfil, /Perfil em preparação/);
});

test("campos de senha permanecem vazios e desabilitados, sem coleta", () => {
  const campos = [...perfil.matchAll(/<TextField\s+type="password"[\s\S]*?\/>/g)];
  assert.equal(campos.length, 3);
  for (const [campo] of campos) {
    assert.match(campo, /value=""/);
    assert.match(campo, /\bdisabled\b/);
  }
});

test("identificação vem da sessão atual e não afirma método ou saúde não consultados", () => {
  assert.match(perfil, /if \(!usuario\) return null/);
  assert.match(perfil, /value=\{usuario\.name\}\s+readOnly/);
  assert.match(perfil, /value=\{usuario\.email\}\s+readOnly/);
  assert.doesNotMatch(perfil, /Cookie seguro|Conectado agora|Ativo agora|Google Workspace SSO|Habilitado/);
});
