import assert from "node:assert/strict";
import { test } from "node:test";

import type { Acesso } from "@plugga/shared";

import { INTEGRACOES, integracoesParaAcesso } from "../app/lib/integracoes.ts";

const membro: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] };
const gerente: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] };
const admin: Acesso = { plataforma: "admin", departamentos: [] };
const desenvolvedor: Acesso = { plataforma: "desenvolvedor", departamentos: [] };

// O portão do Financeiro (lib/recursos.ts) decide onde o OMIE fica; o teste não depende do NODE_ENV da máquina.
const LIGADO = { NODE_ENV: "development" };
const DESLIGADO = { NODE_ENV: "production" };
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

test("com o portão aberto, o OMIE fica na aba Integrações para Desenvolvedor, Admin e Gerente do Financeiro (D6, PLU-342)", () => {
  for (const acesso of [desenvolvedor, admin, gerenteDoFinanceiro]) {
    assert.deepEqual(integracoesParaAcesso(acesso, "integracoes", LIGADO).map((i) => i.id), ["omie", "google-calendar"]);
  }
  // O Gerente do Financeiro não vê nenhuma outra integração da plataforma.
  assert.deepEqual(integracoesParaAcesso(gerenteDoFinanceiro, undefined, LIGADO).map((i) => i.id), ["omie", "google-calendar"]);
  // O membro do Financeiro e o gerente de outro departamento não veem o OMIE.
  for (const acesso of [membroDoFinanceiro, gerente, membro]) assert.ok(!integracoesParaAcesso(acesso, undefined, LIGADO).some((i) => i.id === "omie"));
  // E ele sai da tela do Desenvolvedor.
  assert.ok(!integracoesParaAcesso(desenvolvedor, "desenvolvedor", LIGADO).some((i) => i.id === "omie"));
});

test("com o portão fechado (produção), o OMIE continua de plataforma, na tela do Desenvolvedor, como antes", () => {
  assert.ok(integracoesParaAcesso(desenvolvedor, "desenvolvedor", DESLIGADO).some((i) => i.id === "omie"));
  for (const acesso of [admin, gerenteDoFinanceiro, membroDoFinanceiro]) {
    assert.ok(!integracoesParaAcesso(acesso, undefined, DESLIGADO).some((i) => i.id === "omie"), "só o desenvolvedor vê o OMIE");
  }
  assert.deepEqual(integracoesParaAcesso(desenvolvedor, "integracoes", DESLIGADO).map((i) => i.id), ["google-calendar"]);
});

test("cada escopo tem o seu lugar: pessoais e o do Financeiro na aba Integrações, de plataforma na tela do Desenvolvedor", () => {
  assert.deepEqual(integracoesParaAcesso(membro, "integracoes", LIGADO).map((i) => i.id), ["google-calendar"]);
  const dePlataforma = integracoesParaAcesso(desenvolvedor, "desenvolvedor", LIGADO);
  assert.ok(dePlataforma.length > 0);
  assert.ok(dePlataforma.every((i) => i.escopo === "plataforma"));
  assert.ok(!dePlataforma.some((i) => i.id === "google-calendar"));
  // Quem não é desenvolvedor não recebe nenhuma de plataforma, qualquer que seja o lugar pedido.
  for (const acesso of [membro, gerente, admin, gerenteDoFinanceiro]) assert.deepEqual(integracoesParaAcesso(acesso, "desenvolvedor", LIGADO), []);
});
