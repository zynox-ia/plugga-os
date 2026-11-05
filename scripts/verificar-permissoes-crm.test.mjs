import assert from "node:assert/strict";
import { test } from "node:test";

import { conferirPermissoesCrm, PERMISSOES_CRM } from "../ops/verificar-permissoes-crm.mjs";

const autorizadas = () => PERMISSOES_CRM.map(([relacao, privilegio]) => ({ relacao, privilegio, permitido: true }));

test("confere o papel atual por metadados, sem ler clientes ou conceder permissões", async () => {
  const consultas = [];
  await conferirPermissoesCrm(async (sql) => { consultas.push(sql); return autorizadas(); });
  assert.equal(consultas.length, 1);
  assert.match(consultas[0], /has_table_privilege/);
  assert.match(consultas[0], /has_sequence_privilege/);
  assert.match(consultas[0], /current_user/);
  assert.doesNotMatch(consultas[0], /\b(GRANT|REVOKE|CREATE|ALTER|DROP)\b/i);
  assert.doesNotMatch(consultas[0], /FROM\s+"?(clients|deals|lead_profiles)"?\b/i);
});

test("tabela ou permissão ausente e metadados incompletos impedem a nova API", async () => {
  for (const linhas of [[], autorizadas().slice(1), autorizadas().map((linha, indice) => indice === 0 ? { ...linha, permitido: false } : linha), autorizadas().map((linha, indice) => indice === 0 ? { ...linha, permitido: null } : linha)]) {
    await assert.rejects(conferirPermissoesCrm(async () => linhas), /permissões necessárias/);
  }
});

test("não exige escrita em modelos nem alteração ou exclusão das versões imutáveis", () => {
  assert.deepEqual(PERMISSOES_CRM.filter(([tabela]) => tabela === "lead_proposal_templates"), [["lead_proposal_templates", "SELECT"]]);
  assert.deepEqual(PERMISSOES_CRM.filter(([tabela]) => tabela === "lead_proposal_versions"), [["lead_proposal_versions", "SELECT"], ["lead_proposal_versions", "INSERT"]]);
  assert.ok(PERMISSOES_CRM.some(([relacao, privilegio]) => relacao === "lead_documents" && privilegio === "DELETE"));
  for (const sequencia of ["deals_number_seq", "lead_proposals_number_seq"]) {
    assert.ok(PERMISSOES_CRM.some(([relacao, privilegio]) => relacao === sequencia && privilegio === "USAGE"));
  }
});
