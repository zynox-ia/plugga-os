import { describe, expect, it } from "vitest";
import type { SolarProcessActivation } from "@plugga/shared";

import { papelDaEtapa, pendenciasDoAvanco, proximoPapel, vinculoValido, type ContextoSolar } from "./processo-solar.rules";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const activation: SolarProcessActivation = {
  stages: { atendimento: id(1), qualificacao: id(2), proposta: id(3), visita: id(4), documentos: id(5), validacaoKit: id(6) },
  activatedAt: "2026-11-16T12:00:00.000Z", activatedById: id(9),
};
const projetoCompleto = { installationType: "residential" as const, averageConsumptionKwh: "450", consumerUnit: "UC-1", energyBillDocumentIds: [id(20)] };
const contexto = (parcial: Partial<ContextoSolar> = {}): ContextoSolar => ({
  vinculo: { nome: true, contato: true, cliente: false }, projetos: [projetoCompleto], ...parcial,
});

describe("regras do processo Solar", () => {
  it("identifica o papel pela referência estável da etapa, sem depender do nome", () => {
    expect(papelDaEtapa(activation, id(3).toUpperCase())).toBe("proposta");
    expect(papelDaEtapa(activation, id(99))).toBeNull();
    expect(proximoPapel("documentos")).toBe("validacaoKit");
    expect(proximoPapel("validacaoKit")).toBeNull();
  });

  it("vínculo válido é lead com nome e contato, ou Cliente existente", () => {
    expect(vinculoValido(contexto())).toBe(true);
    expect(vinculoValido(contexto({ vinculo: { nome: true, contato: false, cliente: false } }))).toBe(false);
    expect(vinculoValido(contexto({ vinculo: { nome: false, contato: false, cliente: true } }))).toBe(true);
  });

  it("avançar cobra a saída de cada etapa percorrida e nada das etapas já passadas", () => {
    const semConta = contexto({ projetos: [{ ...projetoCompleto, energyBillDocumentIds: [] }], vinculo: { nome: true, contato: false, cliente: false } });
    expect(pendenciasDoAvanco("atendimento", "qualificacao", semConta).map((item) => item.code)).toEqual(["atendimento.vinculo"]);
    expect(pendenciasDoAvanco("atendimento", "proposta", semConta).map((item) => item.code)).toEqual(["atendimento.vinculo", "qualificacao.dados"]);
    // Negócio legado já em Qualificação: o Atendimento passado não é cobrado.
    expect(pendenciasDoAvanco("qualificacao", "proposta", semConta).map((item) => item.message)).toEqual(["Qualificação: Anexe a conta de energia ao projeto."]);
  });

  it("retornos não têm bloqueio e entrada de fora parte do Atendimento", () => {
    const vazio = contexto({ projetos: [], vinculo: { nome: false, contato: false, cliente: false } });
    expect(pendenciasDoAvanco("visita", "proposta", vazio)).toEqual([]);
    expect(pendenciasDoAvanco(null, "atendimento", vazio)).toEqual([]);
    expect(pendenciasDoAvanco(null, "qualificacao", vazio).map((item) => item.code)).toEqual(["atendimento.vinculo"]);
  });

  it("os quatro dados precisam estar no mesmo projeto", () => {
    const separados = contexto({ projetos: [
      { ...projetoCompleto, energyBillDocumentIds: [] },
      { ...projetoCompleto, averageConsumptionKwh: "0", consumerUnit: "UC-2" },
    ] });
    expect(pendenciasDoAvanco("qualificacao", "proposta", separados).map((item) => item.code)).toEqual(["qualificacao.dados"]);
    expect(pendenciasDoAvanco("qualificacao", "proposta", contexto())).toEqual([]);
  });
});
