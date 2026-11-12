import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const perfil = readFileSync(new URL("../app/configuracoes/perfil-view.tsx", import.meta.url), "utf8");
const seguranca = readFileSync(new URL("../app/configuracoes/seguranca-da-conta-view.tsx", import.meta.url), "utf8");

test("perfil sem API de edição não persiste foto nem simula gravação", () => {
  assert.doesNotMatch(perfil, /\b(localStorage|sessionStorage|FileReader|setTimeout|fetch)\b/);
  assert.doesNotMatch(perfil, /<form\b|type="file"|\bon(?:Submit|Change|Input|Click|Drop)=/);
  assert.doesNotMatch(perfil, /Perfil atualizado|Senha atualizada|salvas com sucesso/);
  assert.match(perfil, /Dados somente para consulta/);
  assert.match(perfil, /Edição e foto em preparação/);
});

test("troca de senha: três campos com autocomplete certo, sem guardar a senha no navegador", () => {
  const campos = [...seguranca.matchAll(/<TextField\s+type="password"[\s\S]*?\/>/g)];
  assert.equal(campos.length, 3);
  assert.match(campos[0]![0], /autoComplete="current-password"/);
  assert.match(campos[1]![0], /autoComplete="new-password"/);
  assert.match(campos[2]![0], /autoComplete="new-password"/);
  for (const [campo] of campos) assert.doesNotMatch(campo, /\bdisabled\b|placeholder=/);
  assert.doesNotMatch(seguranca, /\b(localStorage|sessionStorage|console\.)/);
  assert.match(seguranca, /fetch\("\/api\/auth\/password"/);
});

test("identificação vem da sessão atual e não afirma método ou saúde não consultados", () => {
  assert.match(perfil, /if \(!usuario\) return null/);
  assert.match(perfil, /value=\{usuario\.name\}\s+readOnly/);
  assert.match(perfil, /value=\{usuario\.email\}\s+readOnly/);
  assert.doesNotMatch(perfil + seguranca, /Cookie seguro|Conectado agora|Ativo agora|Google Workspace SSO|Habilitado/);
});

test("perfil mantém dados pessoais e segurança reúne senha e segundo fator sem o cartão de sessão", () => {
  assert.doesNotMatch(perfil, /SegurancaView|type="password"|Dados da sessão atual/);
  assert.match(seguranca, /<SegurancaView\s*\/>/);
  assert.doesNotMatch(seguranca, /Dados da sessão atual|Métodos de Autenticação|usuario\.email/);
});
