import { describe, expect, it } from "vitest";
import { bulkDealsActionSchema, createDealRequestSchema, dealSchema, moveDealStageRequestSchema, setDealPriorityRequestSchema, updateLeadRequestSchema } from "@plugga/shared";

describe("contrato do cliente do negócio", () => {
  it("é nulo até a conversão, e só traz id e nome depois", () => {
    expect(dealSchema.shape.client.parse(null)).toBeNull();
    const cliente = { id: "550e8400-e29b-41d4-a716-446655440000", name: "Cliente" };
    expect(dealSchema.shape.client.parse(cliente)).toEqual(cliente);
    expect(dealSchema.shape.client.parse({ ...cliente, document: "12345678000199" })).toEqual(cliente);
  });
});

describe("contrato do lead do negócio", () => {
  it("normaliza qualificação comercial, permite omitir e limpar cada campo", () => {
    const lead = { companyName: " Empresa comercial ", landlinePhone: "(92) 3333-4444", website: " https://example.com/contato ", mainInterest: " Energia solar ", jobTitle: " Diretora " };
    const normalizado = { companyName: "Empresa comercial", landlinePhone: "9233334444", website: "https://example.com/contato", mainInterest: "Energia solar", jobTitle: "Diretora" };
    expect(updateLeadRequestSchema.parse({ version: 1, lead }).lead).toEqual(normalizado);
    expect(updateLeadRequestSchema.parse({ version: 1, lead: {} }).lead).toEqual({});
    for (const campo of Object.keys(lead)) {
      for (const valor of [null, "", "   "]) {
        expect(updateLeadRequestSchema.parse({ version: 1, lead: { [campo]: valor } }).lead).toEqual({ [campo]: null });
      }
    }
    const criado = createDealRequestSchema.parse({
      pipelineId: "550e8400-e29b-41d4-a716-446655440000", stageId: "550e8400-e29b-41d4-a716-446655440000",
      ownerId: "550e8400-e29b-41d4-a716-446655440000", title: "Qualificação", lead: { personType: "pf", name: "Lead", phone: "92999990000", ...lead },
    });
    expect(criado.lead).toMatchObject(normalizado);
  });

  it("recusa URLs inseguras, telefones incompletos e textos comerciais excessivos", () => {
    for (const website of ["javascript:alert(1)", "data:text/html,teste", "ftp://example.com", "example.com", "//example.com", "https://", `https://example.com/${"a".repeat(2048)}`]) {
      expect(updateLeadRequestSchema.safeParse({ version: 1, lead: { website } }).success).toBe(false);
    }
    expect(updateLeadRequestSchema.safeParse({ version: 1, lead: { website: "http://example.com" } }).success).toBe(true);
    for (const lead of [{ landlinePhone: "3333-4444" }, { companyName: "a".repeat(201) }, { mainInterest: "a".repeat(151) }, { jobTitle: "a".repeat(101) }]) {
      expect(updateLeadRequestSchema.safeParse({ version: 1, lead }).success).toBe(false);
    }
  });

  it("tem dados próprios e exige telefone ou e-mail", () => {
    const lead = {
      pipelineId: "550e8400-e29b-41d4-a716-446655440000",
      stageId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Oportunidade Solar",
      ownerId: "550e8400-e29b-41d4-a716-446655440000",
      lead: { personType: "pf" as const, name: "Lead sem contato" },
    };
    expect(createDealRequestSchema.safeParse(lead).success).toBe(false);
    expect(createDealRequestSchema.safeParse({ ...lead, lead: { ...lead.lead, phone: "92999990000" } }).success).toBe(true);
  });

  it("aceita clientId opcional para vincular a um cliente já cadastrado", () => {
    const base = {
      pipelineId: "550e8400-e29b-41d4-a716-446655440000",
      stageId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Oportunidade Solar",
      ownerId: "550e8400-e29b-41d4-a716-446655440000",
      lead: { personType: "pf" as const, name: "Lead vinculado", email: "lead@teste.local" },
    };
    expect(createDealRequestSchema.parse(base).clientId).toBeUndefined();
    expect(createDealRequestSchema.parse({ ...base, clientId: null }).clientId).toBeNull();
    const clientId = "550e8400-e29b-41d4-a716-446655440000";
    expect(createDealRequestSchema.parse({ ...base, clientId }).clientId).toBe(clientId);
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
