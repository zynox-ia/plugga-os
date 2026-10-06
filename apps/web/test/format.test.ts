import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatarBRL,
  formatarData,
  formatarDataHora,
  formatarDataHoraCurta,
  formatarDiaMes,
  formatarNumero,
} from "../app/lib/format.ts";

// Espaço não separável que o Intl usa entre "R$" e o valor.
const NBSP = " ";

describe("datas em America/Manaus (UTC-4)", () => {
  it("virada de dia em UTC: 02:30Z ainda é o dia anterior em Manaus", () => {
    assert.equal(formatarData("2026-03-10T02:30:00.000Z"), "09/03/2026");
    assert.equal(formatarDiaMes("2026-03-10T02:30:00.000Z"), "09/03");
  });

  it("meia-noite UTC cai às 20h do dia anterior", () => {
    assert.equal(formatarDataHora("2026-01-01T00:00:00.000Z"), "31/12/2025, 20:00:00");
  });

  it("depois das 04:00Z já é o mesmo dia", () => {
    assert.equal(formatarData("2026-03-10T04:00:00.000Z"), "10/03/2026");
    assert.equal(formatarDataHoraCurta("2026-03-10T15:45:00.000Z"), "10/03/2026, 11:45");
  });

  it("não depende do fuso do processo", () => {
    const original = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try {
      assert.equal(formatarData("2026-03-10T02:30:00.000Z"), "09/03/2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("vazio, nulo e inválido viram travessão", () => {
    for (const ruim of [null, undefined, "", "não-é-data"]) {
      assert.equal(formatarData(ruim), "—");
      assert.equal(formatarDataHora(ruim), "—");
      assert.equal(formatarDiaMes(ruim), "—");
    }
  });
});

describe("moeda e número", () => {
  it("formata BRL a partir do decimal em texto", () => {
    assert.equal(formatarBRL("1234.5"), `R$${NBSP}1.234,50`);
    assert.equal(formatarBRL(0), `R$${NBSP}0,00`);
  });

  it("nulo, vazio e não numérico viram travessão", () => {
    assert.equal(formatarBRL(null), "—");
    assert.equal(formatarBRL(""), "—");
    assert.equal(formatarBRL("abc"), "—");
  });

  it("formata número com separador brasileiro", () => {
    assert.equal(formatarNumero("1234.5"), "1.234,5");
    assert.equal(formatarNumero(undefined), "—");
  });
});
