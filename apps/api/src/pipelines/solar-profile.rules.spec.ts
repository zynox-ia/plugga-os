import { describe, expect, it } from "vitest";
import type { PipelineField, PipelineProcessProfile } from "@plugga/shared";

import { configurarPerfilDeProcesso } from "./solar-profile.rules";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile: PipelineProcessProfile = { key: "solar_commercial", version: 1, bindings: {
  installationType: { fieldId: id(1), options: { residential: id(6), commercial: id(7), rural: id(8) } },
  averageConsumptionKwh: { fieldId: id(2) }, roofType: { fieldId: id(3) },
  availableAreaM2: { fieldId: id(4) }, estimatedPowerKwp: { fieldId: id(5) },
} };
const fields: PipelineField[] = [1, 2, 3, 4, 5].map((n) => ({
  id: id(n), name: `Livre ${n}`, type: n === 1 || n === 3 ? "select" : "number",
  options: n === 1 ? [6, 7, 8].map((n) => ({ id: id(n), name: `Opção ${n}` })) : n === 3 ? [{ id: id(9), name: "Qualquer" }] : [],
  position: n - 1, valueCount: 0, showOnCard: false, showInList: false,
}));

describe("associação estável do processo Solar", () => {
  it("aceita associação explícita e preserva omissão/igualdade após rename e reorder", () => {
    expect(configurarPerfilDeProcesso(null, profile, fields)).toEqual(profile);
    const renamed = fields.map((f) => ({ ...f, name: "Renomeado", options: f.options.map((o) => ({ ...o, name: "Novo" })) })).reverse();
    expect(configurarPerfilDeProcesso(profile, undefined, renamed)).toEqual(profile);
    expect(configurarPerfilDeProcesso(profile, profile, renamed)).toEqual(profile);
    expect(configurarPerfilDeProcesso(null, undefined, [])).toBeNull();
    expect(configurarPerfilDeProcesso(null, null, [])).toBeNull();
  });
  it("recusa remoção e alteração de bindings mesmo sem valores", () => {
    expect(() => configurarPerfilDeProcesso(profile, null, fields)).toThrow();
    expect(() => configurarPerfilDeProcesso(profile, { ...profile, bindings: { ...profile.bindings, roofType: { fieldId: id(10) } } }, fields)).toThrow();
    expect(() => configurarPerfilDeProcesso(profile, undefined, fields.slice(1))).toThrow();
    expect(() => configurarPerfilDeProcesso(profile, undefined, fields.map((f) => f.id === id(1) ? { ...f, options: f.options.slice(1) } : f))).toThrow();
    expect(() => configurarPerfilDeProcesso(profile, undefined, fields.map((f) => f.id === id(2) ? { ...f, type: "text" } : f))).toThrow();
  });
  it("recusa referências estrangeiras, bindings repetidos e opções de outro campo", () => {
    expect(() => configurarPerfilDeProcesso(null, profile, [])).toThrow();
    expect(() => configurarPerfilDeProcesso(null, { ...profile, bindings: { ...profile.bindings, availableAreaM2: profile.bindings.averageConsumptionKwh } }, fields)).toThrow();
    expect(() => configurarPerfilDeProcesso(null, { ...profile, bindings: { ...profile.bindings, installationType: { ...profile.bindings.installationType, options: { residential: id(9), commercial: id(7), rural: id(8) } } } }, fields)).toThrow();
  });
});
