import assert from "node:assert/strict";
import { test } from "node:test";

import type { Acesso } from "@plugga/shared";

import { integracoesParaAcesso } from "../app/lib/integracoes.ts";

const membro: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] };
const gerente: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] };
const admin: Acesso = { plataforma: "admin", departamentos: [] };
const desenvolvedor: Acesso = { plataforma: "desenvolvedor", departamentos: [] };

test("o Brevo é integração de plataforma: só o desenvolvedor a vê", () => {
  assert.deepEqual(integracoesParaAcesso(desenvolvedor).map((i) => i.id), ["brevo"]);
  for (const acesso of [membro, gerente, admin]) {
    assert.deepEqual(integracoesParaAcesso(acesso), []);
  }
});
