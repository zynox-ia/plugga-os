import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateInputError, dateValue, displayDate, maskDateInput, parseDate, parseDateInput } from "../app/components/ui/date-value.ts";

describe("datas civis do seletor", () => {
  it("valida ano bissexto e rejeita datas impossíveis sem normalizar para outro dia", () => {
    for (const value of ["2026-02-29", "2026-04-31", "1900-02-29", "0000-01-01", "2026-13-01", "2026-01-00", "2026-1-1"]) {
      assert.equal(parseDate(value), undefined, value);
    }
    for (const value of ["2028-02-29", "2000-02-29", "0099-01-01", "2026-12-31"]) {
      assert.equal(dateValue(parseDate(value)!), value);
    }
  });

  it("converte datas brasileiras sem deslocar o dia pelo fuso horário", () => {
    assert.equal(displayDate("2026-10-22"), "22/10/2026");
    assert.equal(dateValue(parseDateInput("22/10/2026")!), "2026-10-22");
    const date = parseDateInput("01/01/2026")!;
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 0);
    assert.equal(date.getDate(), 1);
    assert.equal(parseDateInput("1/1/2026"), undefined);
    assert.equal(displayDate("inválida"), "");
  });

  it("aceita limites inclusivos e diferencia vazio, incompleto e fora do período", () => {
    const limits = { min: "2026-10-01", max: "2026-12-31" };
    assert.equal(dateInputError("01/10/2026", limits), undefined);
    assert.equal(dateInputError("31/12/2026", limits), undefined);
    assert.match(dateInputError("30/09/2026", limits)!, /a partir de 01\/10\/2026/);
    assert.match(dateInputError("01/01/2027", limits)!, /até 31\/12\/2026/);
    assert.equal(dateInputError("", limits), undefined);
    assert.equal(dateInputError("", { required: true }), "Informe uma data.");
    assert.match(dateInputError("22/10", limits)!, /data válida/);
  });

  it("permite digitar, colar e apagar a data", () => {
    assert.equal(maskDateInput("22102026"), "22/10/2026");
    assert.equal(maskDateInput("22/10/2026"), "22/10/2026");
    assert.equal(maskDateInput("22/1"), "22/1");
    assert.equal(maskDateInput("22/"), "22");
    assert.equal(maskDateInput(""), "");
  });
});
