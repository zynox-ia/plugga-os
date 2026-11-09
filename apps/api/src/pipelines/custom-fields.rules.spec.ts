import { describe, expect, it } from "vitest";
import type { PipelineField } from "@plugga/shared";
import { configurarCampos, validarValores, valoresDoPipeline } from "./custom-fields.rules";
const id = "00000000-0000-4000-8000-000000000001";
const opt = "00000000-0000-4000-8000-000000000002";
const field = (type: PipelineField["type"] = "text"): PipelineField => ({ id, name: "Campo", type, options: type === "select" ? [{ id: opt, name: "Opção" }] : [], position: 0, valueCount: 0, showOnCard: false, showInList: false });
describe("definições de campos por pipeline", () => {
  it("gera IDs no servidor e preserva identidade ao renomear", () => {
    const [created] = configurarCampos([], [{ name: "Novo", type: "select", options: [{ name: "A" }], showOnCard: true, showInList: false }], [], {});
    expect(created?.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(created?.options[0]?.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(configurarCampos([field()], [{ ...field(), name: "Renomeado" }], [], {})[0]?.id).toBe(id);
  });
  it("recusa IDs forjados e opções de outro campo mesmo com rótulos iguais", () => {
    expect(() => configurarCampos([], [field()], [], {})).toThrow(/pipeline/);
    expect(() => configurarCampos([field("select")], [{ ...field("select"), options: [{ id, name: "Inválida" }] }], [], {})).toThrow(/opção/i);
  });
  it("campos preenchidos exigem confirmação; zero/false entram nas contagens", () => {
    expect(() => configurarCampos([field()], [], [], { [id]: { count: 2, options: {} } })).toThrow(/2/);
    expect(configurarCampos([field()], [], [id], { [id]: { count: 2, options: {} } })).toEqual([]);
    expect(() => configurarCampos([field()], [{ ...field(), type: "number" }], [], { [id]: { count: 1, options: {} } })).toThrow(/tipo/i);
  });
  it("opção usada não some, mas nome muda sem apagar valor", () => {
    const counts = { [id]: { count: 1, options: { [opt]: 1 } } };
    expect(() => configurarCampos([field("select")], [{ ...field("select"), options: [{ name: "Nova" }] }], [], counts)).toThrow(/opção/i);
    expect(configurarCampos([field("select")], [{ ...field("select"), options: [{ id: opt, name: "Outro rótulo" }] }], [], counts)[0]?.options[0]?.id).toBe(opt);
  });
});
describe("valores tipados no pipeline atual", () => {
  it("valida tipos, normaliza decimal e distingue false/zero/null de ausência", () => {
    expect(validarValores([field("boolean")], { [id]: false }, [])).toEqual({ [id]: false });
    expect(validarValores([field("number")], { [id]: "000.000" }, [])).toEqual({ [id]: "0" });
    expect(validarValores([field("money")], { [id]: "12.5" }, [])).toEqual({ [id]: "12.50" });
    expect(validarValores([field()], { [id]: null }, [])).toEqual({ [id]: null });
    expect(validarValores([field()], {}, [])).toEqual({});
    for (const [type, value] of [["boolean", "false"], ["number", "NaN"], ["money", "1.001"], ["date", "2026-02-29"], ["select", id], ["person", id]] as const) {
      expect(() => validarValores([field(type)], { [id]: value }, [])).toThrow();
    }
    expect(validarValores([field("date")], { [id]: "2028-02-29" }, [])).toEqual({ [id]: "2028-02-29" });
    expect(validarValores([field("select")], { [id]: opt }, [])).toEqual({ [id]: opt });
    expect(validarValores([field("person")], { [id]: opt }, [opt])).toEqual({ [id]: opt });
  });
  it("rejeita campos desconhecidos mesmo ao limpar e filtra preservados de origem", () => {
    expect(() => validarValores([], { [id]: null }, [])).toThrow(/pipeline/);
    expect(valoresDoPipeline([field()], { [id]: false, [opt]: "segredo" })).toEqual({ [id]: false });
    expect(valoresDoPipeline([], { [id]: false })).toEqual({});
  });
});
