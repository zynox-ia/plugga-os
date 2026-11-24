import assert from "node:assert/strict";
import { it } from "node:test";

import { contasDeEnergiaDaFicha } from "../app/lib/documentos-ficha-solar.ts";

const negocioId = "00000000-0000-4000-8000-000000000001";
const conta = { id: "00000000-0000-4000-8000-000000000002", dealId: negocioId, category: "conta_de_energia" as const, originalName: "Conta de julho.pdf", archivedAt: null };

it("oferece somente contas de energia ativas do mesmo negócio", () => {
  const resultado = contasDeEnergiaDaFicha([
    conta,
    { ...conta, id: "outra-categoria", category: "proposta" },
    { ...conta, id: "arquivada", archivedAt: "2026-11-09T10:00:00.000Z" },
    { ...conta, id: "outro-negocio", dealId: "00000000-0000-4000-8000-000000000003" },
  ], negocioId, conta.id);
  assert.deepEqual(resultado.opcoes, [{ id: conta.id, nome: conta.originalName, indisponivel: false }]);
  assert.equal(resultado.selecionadaIndisponivel, false);
});

it("preserva a referência escolhida quando a conta some ou é arquivada", () => {
  const arquivada = contasDeEnergiaDaFicha([{ ...conta, archivedAt: "2026-11-09T10:00:00.000Z" }], negocioId, conta.id);
  assert.equal(arquivada.selecionadaIndisponivel, true);
  assert.deepEqual(arquivada.opcoes, [{ id: conta.id, nome: "Conta de julho.pdf (indisponível)", indisponivel: true }]);

  const sumiu = contasDeEnergiaDaFicha([], negocioId, conta.id);
  assert.deepEqual(sumiu.opcoes, [{ id: conta.id, nome: "Conta de energia indisponível", indisponivel: true }]);
});

it("mantém a seleção indisponível sem usar metadados de outro negócio nem escolher outra conta", () => {
  const outraConta = { ...conta, id: "00000000-0000-4000-8000-000000000004" };
  const resultado = contasDeEnergiaDaFicha([{ ...conta, dealId: "outro-negocio", originalName: "Não mostrar.pdf" }, outraConta], negocioId, conta.id);
  assert.equal(resultado.opcoes.find((item) => item.id === conta.id)?.nome, "Conta de energia indisponível");
  assert.equal(resultado.selecionadaIndisponivel, true);
  assert.deepEqual(contasDeEnergiaDaFicha([conta], negocioId, null).opcoes, [{ id: conta.id, nome: conta.originalName, indisponivel: false }]);
});
