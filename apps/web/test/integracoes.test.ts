import assert from "node:assert/strict";
import { test } from "node:test";

import type { Acesso } from "@plugga/shared";

import { INTEGRACOES, integracoesParaAcesso } from "../app/lib/integracoes.ts";

const membro: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] };
const gerente: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] };
const admin: Acesso = { plataforma: "admin", departamentos: [] };
const desenvolvedor: Acesso = { plataforma: "desenvolvedor", departamentos: [] };

const gerenteDoFinanceiro: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] };
const membroDoFinanceiro: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro" }] };

test("Brevo, consulta de CNPJ e CEP e credenciais do Google são integrações de plataforma: só o desenvolvedor as vê", () => {
  const dePlataforma = ["brevo", "cadastro", "telegram", "autentique", "openrouter", "claude-assinatura", "codex-assinatura", "google-oauth"];
  const doDesenvolvedor = integracoesParaAcesso(desenvolvedor).map((i) => i.id);
  for (const id of dePlataforma) assert.ok(doDesenvolvedor.includes(id as never), id);
  for (const acesso of [membro, gerente, admin]) {
    const ids = integracoesParaAcesso(acesso).map((i) => i.id);
    for (const id of dePlataforma) assert.ok(!ids.includes(id as never), `${id} não deve aparecer`);
  }
});

test("o Google Calendar é integração pessoal: todo papel a vê, e é só ela que o membro enxerga", () => {
  const calendario = INTEGRACOES.find((i) => i.id === "google-calendar");
  assert.equal(calendario?.escopo, "pessoal");
  for (const acesso of [membro, gerente, admin, desenvolvedor]) {
    assert.ok(integracoesParaAcesso(acesso).some((i) => i.id === "google-calendar"));
  }
  assert.deepEqual(integracoesParaAcesso(membro).map((i) => i.id), ["google-calendar"]);
  assert.deepEqual(integracoesParaAcesso(gerente).map((i) => i.id), ["google-calendar"]);
});

test("a integração com o OMIE foi extinta (24/11/2026): não está no catálogo nem para quem gere o Financeiro", () => {
  assert.ok(!INTEGRACOES.some((i) => (i.id as string) === "omie"));
  for (const acesso of [desenvolvedor, admin, gerenteDoFinanceiro, membroDoFinanceiro]) {
    assert.ok(!integracoesParaAcesso(acesso).some((i) => (i.id as string) === "omie"));
  }
  // O Gerente do Financeiro vê só as pessoais, como qualquer pessoa sem a plataforma.
  assert.deepEqual(integracoesParaAcesso(gerenteDoFinanceiro).map((i) => i.id), ["google-calendar"]);
});

test("cada escopo tem o seu lugar: pessoais na aba Integrações, de plataforma na tela do Desenvolvedor", () => {
  assert.deepEqual(integracoesParaAcesso(membro, "integracoes").map((i) => i.id), ["google-calendar"]);
  assert.deepEqual(integracoesParaAcesso(desenvolvedor, "integracoes").map((i) => i.id), ["google-calendar"]);
  const dePlataforma = integracoesParaAcesso(desenvolvedor, "desenvolvedor");
  assert.ok(dePlataforma.length > 0);
  assert.ok(dePlataforma.every((i) => i.escopo === "plataforma"));
  assert.ok(!dePlataforma.some((i) => i.id === "google-calendar"));
  // Quem não é desenvolvedor não recebe nenhuma de plataforma, qualquer que seja o lugar pedido.
  for (const acesso of [membro, gerente, admin, gerenteDoFinanceiro]) assert.deepEqual(integracoesParaAcesso(acesso, "desenvolvedor"), []);
});
