import assert from "node:assert/strict";
import { test } from "node:test";

import type { Acesso } from "@plugga/shared";

import { INTEGRACOES, integracoesParaAcesso } from "../app/lib/integracoes.ts";

const membro: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] };
const gerente: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] };
const admin: Acesso = { plataforma: "admin", departamentos: [] };
const desenvolvedor: Acesso = { plataforma: "desenvolvedor", departamentos: [] };

test("Brevo, consulta de CNPJ e CEP e credenciais do Google são integrações de plataforma: só o desenvolvedor as vê", () => {
  const dePlataforma = ["brevo", "cadastro", "telegram", "autentique", "omie", "google-oauth"];
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
  assert.deepEqual(integracoesParaAcesso(admin).map((i) => i.id), ["google-calendar"]);
});

test("cada escopo tem o seu lugar: pessoais na aba Integrações, de plataforma na tela do Desenvolvedor", () => {
  assert.deepEqual(integracoesParaAcesso(desenvolvedor, "pessoal").map((i) => i.id), ["google-calendar"]);
  const dePlataforma = integracoesParaAcesso(desenvolvedor, "plataforma");
  assert.ok(dePlataforma.length > 0);
  assert.ok(dePlataforma.every((i) => i.escopo === "plataforma"));
  assert.ok(!dePlataforma.some((i) => i.id === "google-calendar"));
  // Quem não é desenvolvedor não recebe nenhuma de plataforma, qualquer que seja o escopo pedido.
  for (const acesso of [membro, gerente, admin]) assert.deepEqual(integracoesParaAcesso(acesso, "plataforma"), []);
});
