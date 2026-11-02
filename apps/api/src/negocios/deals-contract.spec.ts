import { describe, expect, it } from "vitest";
import { bulkDealsActionSchema, createDealRequestSchema, dealSchema, moveDealStageRequestSchema, setDealPriorityRequestSchema } from "@plugga/shared";

describe("contrato do cliente do negócio", () => {
  it("preserva dados cadastrais e aceita valores nulos", () => {
    const cliente = {
      id: "550e8400-e29b-41d4-a716-446655440000", name: "Cliente", personType: "pj",
      document: "12345678000199", phone: null, email: "cliente@teste.local",
      city: "Manaus", state: "AM", legalName: null,
    };
    expect(dealSchema.shape.client.parse(cliente)).toEqual(cliente);
    expect(dealSchema.shape.client.safeParse({ ...cliente, document: undefined }).success).toBe(false);
  });
});

describe("contrato de prioridade", () => {
  it("aceita três níveis e limpeza, recusando valores desconhecidos", () => {
    for (const priority of ["urgente", "medio", "normal", null]) {
      expect(setDealPriorityRequestSchema.safeParse({ priority }).success).toBe(true);
      expect(bulkDealsActionSchema.safeParse({ type: "priority", priority }).success).toBe(true);
      expect(createDealRequestSchema.shape.priority.safeParse(priority).success).toBe(true);
    }
    expect(setDealPriorityRequestSchema.safeParse({ priority: "alta" }).success).toBe(false);
    expect(setDealPriorityRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("número do negócio", () => {
  it("aceita somente inteiros positivos", () => {
    for (const numero of [1, 42]) expect(dealSchema.shape.number.safeParse(numero).success).toBe(true);
    for (const numero of [0, -1, 1.5, null]) expect(dealSchema.shape.number.safeParse(numero).success).toBe(false);
  });
});

describe("referência de ordenação", () => {
  it("distingue omissão, fim e referência válida", () => {
    const stageId = "550e8400-e29b-41d4-a716-446655440000";
    expect(moveDealStageRequestSchema.parse({ stageId })).toEqual({ stageId });
    expect(moveDealStageRequestSchema.parse({ stageId, beforeDealId: null })).toEqual({ stageId, beforeDealId: null });
    expect(moveDealStageRequestSchema.safeParse({ stageId, beforeDealId: stageId }).success).toBe(true);
    expect(moveDealStageRequestSchema.safeParse({ stageId, beforeDealId: "inválido" }).success).toBe(false);
  });
});
