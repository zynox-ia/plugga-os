import assert from "node:assert/strict";
import { test } from "node:test";
import type { PipelineField } from "@plugga/shared";
import { campoCorrespondeAoFiltro, formatarCampoDoPipeline } from "../app/lib/campos-do-pipeline.ts";

const campo: PipelineField = { id: "campo", name: "Dado", type: "text", options: [], position: 0, valueCount: 0, showOnCard: true, showInList: true };
test("formata os tipos sem confundir falso e zero com ausência", () => {
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "boolean" }, false), "Não");
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "number" }, "0"), "0");
  assert.equal(formatarCampoDoPipeline(campo, null), "Não informado");
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "date" }, "2026-11-09"), "09/11/2026");
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "select", options: [{ id: "opcao", name: "Laje" }] }, "opcao"), "Laje");
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "person" }, "pessoa", [{ id: "pessoa", name: "Ana" }]), "Ana");
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "person" }, "desconhecida"), "Pessoa indisponível");
  assert.match(formatarCampoDoPipeline({ ...campo, type: "money" }, "1234.50"), /1\.234,50/);
  assert.equal(formatarCampoDoPipeline({ ...campo, type: "number" }, "999999999999999999.123456"), "999.999.999.999.999.999,123456");
});

test("filtros usam rótulos e preservam a distinção entre não e não informado", () => {
  assert.equal(campoCorrespondeAoFiltro({ ...campo, type: "boolean" }, false, "Não"), true);
  assert.equal(campoCorrespondeAoFiltro({ ...campo, type: "boolean" }, null, "Não"), false);
  assert.equal(campoCorrespondeAoFiltro({ ...campo, type: "number" }, "0", "0"), true);
  assert.equal(campoCorrespondeAoFiltro({ ...campo, type: "select", options: [{ id: "id", name: "Cerâmico" }] }, "id", "ceramico"), true);
});
