import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { caiNoDia, semanaDe, somarDias } from "@plugga/shared";

import { diasDaRecorrenciaDoE2e, diaDaSemanaEmManaus } from "../e2e/support/dias-da-recorrencia.ts";

const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * O e2e "tarefa recorrente" (tarefas-engenharia.spec.ts) marca os dias por
 * esta função. A semana de 23 a 29/11/2026, às 10:00 de Manaus (14:00 UTC).
 */
const SEMANA = [
  { dia: "2026-11-23", nome: "seg", dias: ["seg", "ter"], aparece: true },
  { dia: "2026-11-24", nome: "ter", dias: ["ter", "qua"], aparece: true },
  { dia: "2026-11-25", nome: "qua", dias: ["qua", "qui"], aparece: true },
  { dia: "2026-11-26", nome: "qui", dias: ["qui", "sex"], aparece: true },
  // Sexta: hoje e a segunda seguinte, na ordem da semana.
  { dia: "2026-11-27", nome: "sex", dias: ["seg", "sex"], aparece: true },
  { dia: "2026-11-28", nome: "sáb", dias: ["seg", "qua"], aparece: false },
  { dia: "2026-11-29", nome: "dom", dias: ["seg", "qua"], aparece: false },
] as const;

describe("dias da recorrência do e2e, pelo dia em que roda", () => {
  for (const caso of SEMANA) {
    it(`${caso.nome} ${caso.dia}: marca ${caso.dias.join(" e ")}`, () => {
      const escolha = diasDaRecorrenciaDoE2e(new Date(`${caso.dia}T14:00:00Z`));
      assert.deepEqual(escolha.dias, caso.dias);
      assert.equal(escolha.texto, caso.dias.join(", "));
      assert.equal(escolha.apareceNestaSemana, caso.aparece);
      // Num dia útil, hoje é um dos dias: nasce a ocorrência de hoje (a geração vai até o domingo).
      if (caso.aparece) assert.ok((escolha.dias as readonly string[]).includes(caso.nome));
    });
  }

  /** Os dias, de hoje até o domingo da semana, em que a regra gera ocorrência (a mesma conta da API). */
  const geradosNaSemana = (hoje: string, dias: readonly string[]) => {
    const regra = { recorrencia: "dias_da_semana" as const, dias: dias.map((d) => NOMES.indexOf(d)) };
    const gerados: string[] = [];
    for (let dia = hoje; dia <= semanaDe(hoje).fim; dia = somarDias(dia, 1)) if (caiNoDia(regra, dia)) gerados.push(dia);
    return gerados;
  };

  it("pela regra da geração: num dia útil a escolha gera a ocorrência de hoje", () => {
    for (const caso of SEMANA.filter((c) => c.aparece)) {
      assert.ok(geradosNaSemana(caso.dia, diasDaRecorrenciaDoE2e(new Date(`${caso.dia}T14:00:00Z`)).dias).includes(caso.dia), caso.dia);
    }
  });

  it("a causa da falha: seg e qua fixos não geram nada de quinta a domingo", () => {
    for (const caso of SEMANA) {
      const vazio = ["qui", "sex", "sáb", "dom"].includes(caso.nome);
      assert.equal(geradosNaSemana(caso.dia, ["seg", "qua"]).length === 0, vazio, caso.dia);
    }
  });

  it("usa a data de Manaus, não a UTC: 01:00 UTC de sábado ainda é sexta em Manaus", () => {
    assert.equal(diaDaSemanaEmManaus(new Date("2026-11-28T01:00:00Z")), 5);
    assert.deepEqual(diasDaRecorrenciaDoE2e(new Date("2026-11-28T01:00:00Z")).dias, ["seg", "sex"]);
    // 04:00 UTC é meia-noite em Manaus (UTC-4): já é sábado.
    assert.equal(diaDaSemanaEmManaus(new Date("2026-11-28T04:00:00Z")), 6);
  });
});
