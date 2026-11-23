import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  caiNoDia,
  concluirOcorrenciaSchema,
  criarTarefaSchema,
  ehDiaUtilDaTarefa,
  listarTarefasQuerySchema,
  proximasOcorrencias,
  semanaDe,
  textoDaRecorrencia,
} from "../dist/tarefas.js";

const RESP = "00000000-0000-0000-0000-0000000000a1";
const SUBS = "00000000-0000-0000-0000-0000000000a2";
const base = { titulo: "Conferir o monitoramento", empresa: "waze", responsavelId: RESP, horarioLimite: "12:00", exigeEvidencia: true, exigeResultado: false };

describe("recorrência das tarefas", () => {
  it("dia útil é de segunda a sexta, e feriado conta como dia útil", () => {
    assert.equal(ehDiaUtilDaTarefa("2026-11-23"), true); // segunda
    assert.equal(ehDiaUtilDaTarefa("2026-11-28"), false); // sábado
    assert.equal(ehDiaUtilDaTarefa("2026-12-25"), true); // Natal, sexta: conta
  });

  it("calcula as próximas ocorrências de cada regra", () => {
    assert.deepEqual(proximasOcorrencias({ recorrencia: "dia_util" }, "2026-11-27", 3), ["2026-11-27", "2026-11-30", "2026-12-01"]);
    assert.deepEqual(proximasOcorrencias({ recorrencia: "dias_da_semana", dias: [1, 3] }, "2026-11-23", 3), ["2026-11-23", "2026-11-25", "2026-11-30"]);
    assert.deepEqual(proximasOcorrencias({ recorrencia: "mensal_dia", dia: 5 }, "2026-11-23", 2), ["2026-12-05", "2027-01-05"]);
    // 1º de agosto de 2026 é sábado: o 1º dia útil é segunda, 3.
    assert.deepEqual(proximasOcorrencias({ recorrencia: "mensal_primeiro_dia_util" }, "2026-07-15", 2), ["2026-08-03", "2026-09-01"]);
    assert.deepEqual(proximasOcorrencias({ recorrencia: "dia_util" }, "2026-11-23", 10, "2026-11-25"), ["2026-11-23", "2026-11-24", "2026-11-25"]);
    assert.equal(caiNoDia({ recorrencia: "mensal_primeiro_dia_util" }, "2026-08-01"), false);
  });

  it("escreve o texto da recorrência e acha a semana de segunda a domingo", () => {
    assert.equal(textoDaRecorrencia({ tipo: "recorrente", regra: { recorrencia: "dia_util" }, dia: "2026-11-23", horarioLimite: "12:00" }), "Todo dia útil, até 12:00");
    assert.equal(textoDaRecorrencia({ tipo: "recorrente", regra: { recorrencia: "dias_da_semana", dias: [3, 1] }, dia: "2026-11-23", horarioLimite: "16:00" }), "seg, qua, até 16:00");
    assert.equal(textoDaRecorrencia({ tipo: "unica", regra: null, dia: "2026-11-20", horarioLimite: "17:00" }), "Única · sex 20/11, até 17:00");
    assert.deepEqual(semanaDe("2026-11-29"), { inicio: "2026-11-23", fim: "2026-11-29" });
    assert.deepEqual(semanaDe("2026-11-23"), { inicio: "2026-11-23", fim: "2026-11-29" });
  });
});

describe("criarTarefaSchema", () => {
  it("aceita única com data e recorrente com regra e início", () => {
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "unica", data: "2026-11-30" }).success, true);
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "recorrente", regra: { recorrencia: "dia_util" }, inicio: "2026-11-30" }).success, true);
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "recorrente", inicio: "2026-11-30" }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "unica", regra: { recorrencia: "dia_util" }, data: "2026-11-30" }).success, false);
  });

  it("exige evidência ou resultado, substituto diferente e regra válida", () => {
    assert.equal(criarTarefaSchema.safeParse({ ...base, exigeEvidencia: false, tipo: "unica", data: "2026-11-30" }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ ...base, substitutoId: RESP, tipo: "unica", data: "2026-11-30" }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ ...base, substitutoId: SUBS, tipo: "unica", data: "2026-11-30" }).success, true);
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "recorrente", regra: { recorrencia: "mensal_dia", dia: 31 }, inicio: "2026-11-30" }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "recorrente", regra: { recorrencia: "dias_da_semana", dias: [] }, inicio: "2026-11-30" }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ ...base, tipo: "unica", data: "2026-11-30", horarioLimite: "24:00" }).success, false);
  });
});

describe("consultas e conclusão", () => {
  it("o período padrão é Hoje e o checklist vem como índices", () => {
    assert.equal(listarTarefasQuerySchema.parse({}).periodo, "hoje");
    assert.equal(listarTarefasQuerySchema.safeParse({ empresa: "ambas" }).success, false);
    assert.deepEqual(concluirOcorrenciaSchema.parse({ checklist: "0, 2" }).checklist, [0, 2]);
    assert.deepEqual(concluirOcorrenciaSchema.parse({ checklist: "" }).checklist, []);
    assert.equal(concluirOcorrenciaSchema.parse({ resultado: "  " }).resultado, null);
  });
});
