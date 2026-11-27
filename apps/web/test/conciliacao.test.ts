import assert from "node:assert/strict";
import test from "node:test";

import { consultaDaConciliacao, hrefDaConciliacao, lerFiltrosDaConciliacao, periodoAceito, periodoDoMes } from "../app/lib/conciliacao.ts";

const HOJE = "2026-11-26";

test("o período padrão é o mês corrente até hoje", () => {
  assert.deepEqual(periodoDoMes(HOJE), { de: "2026-11-01", ate: HOJE });
  assert.equal(periodoAceito("2026-11-01", HOJE), true);
  assert.equal(periodoAceito("2026-11-26", "2026-11-01"), false);
  assert.equal(periodoAceito("2024-01-01", "2026-01-01"), false);
});

test("filtro inválido cai no mês, e o endereço leva conta, empresa e aba", () => {
  const filtros = lerFiltrosDaConciliacao({ de: "ontem", ate: "2026-11-20", empresa: "waze", conta: "nao-uuid", aba: "conciliados" }, HOJE);
  assert.equal(filtros.de, "2026-11-01");
  assert.equal(filtros.ate, "2026-11-20");
  assert.equal(filtros.empresa, "waze");
  assert.equal(filtros.conta, undefined);
  assert.equal(filtros.aba, "conciliados");
  assert.equal(hrefDaConciliacao({ ...filtros, conta: "11111111-1111-4111-8111-111111111111" }), "/financeiro/conciliacao?empresa=waze&conta=11111111-1111-4111-8111-111111111111&de=2026-11-01&ate=2026-11-20&aba=conciliados");
  assert.deepEqual(consultaDaConciliacao(filtros), { de: "2026-11-01", ate: "2026-11-20", empresa: "waze" });
});
