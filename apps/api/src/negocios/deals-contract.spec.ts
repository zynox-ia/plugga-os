import { describe, expect, it } from "vitest";
import { dealSchema } from "@plugga/shared";

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
