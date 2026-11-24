import assert from "node:assert/strict";
import { test } from "node:test";

import { diaCurtoDaAgenda, diasVisiveis, hrefDaAgenda, iniciaisDoNome, lerFiltrosDaAgenda, nomeDoDia, osNaSemana, rotuloDaSemana } from "../app/lib/agenda.ts";

const T = "3f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";

test("filtros da agenda pelo endereço, com ida e volta", () => {
  assert.deepEqual(lerFiltrosDaAgenda({}), {});
  assert.deepEqual(lerFiltrosDaAgenda({ semana: "2026-13-45", empresa: "x", tecnico: "igor" }), {});
  const f = lerFiltrosDaAgenda({ semana: "2026-11-30", empresa: "waze", tecnico: T });
  assert.deepEqual(f, { semana: "2026-11-30", empresa: "waze", tecnicoId: T });
  assert.equal(hrefDaAgenda(f), `/engenharia/agenda?semana=2026-11-30&empresa=waze&tecnico=${T}`);
  assert.equal(hrefDaAgenda({}), "/engenharia/agenda");
});

test("rótulo da semana e dos dias", () => {
  assert.equal(rotuloDaSemana("2026-11-23", "2026-11-27"), "23 a 27 de novembro");
  assert.equal(rotuloDaSemana("2026-11-30", "2026-12-04"), "30 de novembro a 4 de dezembro");
  assert.equal(rotuloDaSemana("2026-12-28", "2027-01-01"), "28 de dezembro a 1 de janeiro de 2027");
  assert.equal(diaCurtoDaAgenda("2026-11-23"), "23 nov");
  assert.equal(nomeDoDia("2026-11-23"), "Segunda");
  assert.equal(iniciaisDoNome("Igor Nascimento"), "IN");
  assert.equal(iniciaisDoNome(" janderson "), "J");
});

test("sábado e domingo só aparecem com O.S.; a contagem soma a semana", () => {
  const dias = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"].map((dia, i) => ({ dia, util: i < 5, hoje: i === 0 }));
  const os = { id: "x" } as never;
  const vazia = (dia: string) => ({ dia, ordens: [] });
  const linha = { tecnico: { id: T, nome: "Igor" }, dias: dias.map((d) => (d.dia === "2026-11-24" ? { dia: d.dia, ordens: [os, os] } : vazia(d.dia))) };
  assert.deepEqual(diasVisiveis({ dias, linhas: [linha], semTecnico: [] }).map((d) => d.dia), dias.slice(0, 5).map((d) => d.dia));
  const sabado = { dia: "2026-11-28", ordens: [os] };
  assert.deepEqual(diasVisiveis({ dias, linhas: [linha], semTecnico: [sabado] }).map((d) => d.dia).at(-1), "2026-11-28");
  assert.equal(osNaSemana(linha), 2);
});
