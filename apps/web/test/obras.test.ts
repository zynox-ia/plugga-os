import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consultaDasObras,
  entregaMinima,
  hrefDasObras,
  lerFiltrosDasObras,
  lerOrcamento,
  potenciaDaObra,
  prazoDaObra,
  problemaDoDocumento,
  problemasDaNovaObra,
  temFiltroNasObras,
  type NovaObra,
} from "../app/lib/obras.ts";

const O1 = "3f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
const HOJE = "2026-11-24";

test("filtros pelo endereço e a consulta da API: atrasadas vira atrasadas=sim", () => {
  assert.deepEqual(lerFiltrosDasObras({ situacao: "atrasadas", empresa: "waze", busca: " galpão " }), { situacao: "atrasadas", empresa: "waze", busca: "galpão" });
  assert.deepEqual(lerFiltrosDasObras({ situacao: "x", empresa: "y" }), {});
  assert.equal(hrefDasObras({}), "/engenharia/obras");
  assert.equal(hrefDasObras({ situacao: "entregue" }, O1), `/engenharia/obras?situacao=entregue&obra=${O1}`);
  assert.deepEqual(consultaDasObras({ situacao: "atrasadas", empresa: "plugga" }), { empresa: "plugga", busca: undefined, atrasadas: "sim" });
  assert.equal(consultaDasObras({ situacao: "em_andamento" }).situacao, "em_andamento");
  assert.equal(temFiltroNasObras({ empresa: "waze" }), false);
});

test("card: o próximo marco (atrasado ou não) ou a entrega; potência em pt-BR", () => {
  const marcos = { feitos: 2, total: 6, atrasados: 1, proximo: { nome: "Material entregue", previstoEm: "2026-11-20", atrasado: true } };
  assert.deepEqual(prazoDaObra({ marcos, entregaPrevistaEm: "2027-02-26", situacao: "em_andamento" }), { dia: "2026-11-20", texto: "marco atrasado", atrasado: true });
  assert.deepEqual(prazoDaObra({ marcos: { ...marcos, proximo: null }, entregaPrevistaEm: "2027-02-26", situacao: "entregue" }), { dia: "2027-02-26", texto: "entregue", atrasado: false });
  assert.equal(potenciaDaObra("61.2"), "61,2 kWp");
  assert.equal(potenciaDaObra(null), null);
});

const nova = (o: Partial<NovaObra>): NovaObra => ({ empresa: "waze", clienteId: O1, nome: "Galpão (sintético)", potencia: "61,2", responsavelId: "", inicioEm: "2026-10-20", entregaPrevistaEm: "2027-02-26", ...o });

test("nova obra: início pode ser passado; entrega depois do início e a partir de amanhã", () => {
  assert.deepEqual(problemasDaNovaObra(nova({}), HOJE), {});
  assert.equal(problemasDaNovaObra(nova({ entregaPrevistaEm: "2026-10-20" }), HOJE).entregaPrevistaEm, "a entrega precisa ser depois do início.");
  assert.equal(problemasDaNovaObra(nova({ entregaPrevistaEm: HOJE }), HOJE).entregaPrevistaEm, "a entrega precisa ser a partir de amanhã.");
  assert.deepEqual(Object.keys(problemasDaNovaObra(nova({ nome: " ", clienteId: "", potencia: "0", inicioEm: "" }), HOJE)).sort(), ["clienteId", "inicioEm", "nome", "potencia"]);
  assert.equal(entregaMinima("2026-10-20", HOJE), "2026-11-25");
  assert.equal(entregaMinima("2026-12-01", HOJE), "2026-12-02");
});

test("orçamento em reais e o documento aceito", () => {
  assert.deepEqual(lerOrcamento("125.000,50"), { valor: "125000,50", problema: null });
  assert.deepEqual(lerOrcamento("R$ 1250.5"), { valor: "1250,5", problema: null });
  assert.deepEqual(lerOrcamento(""), { valor: null, problema: null });
  assert.equal(lerOrcamento("12,345").problema, "use um valor como 125.000,50.");
  assert.equal(problemaDoDocumento({ name: "Cronograma.mpp", type: "", size: 10 }), null);
  assert.equal(problemaDoDocumento({ name: "ata.pdf", type: "application/pdf", size: 10 }), null);
  assert.match(problemaDoDocumento({ name: "planilha.xlsx", type: "application/vnd.ms-excel", size: 10 })!, /PDF, imagem/);
  assert.equal(problemaDoDocumento({ name: "grande.pdf", type: "application/pdf", size: 60 * 1024 * 1024 }), "o arquivo passa de 50 MB.");
});
