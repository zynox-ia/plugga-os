import { criarOrdemPeloAgenteSchema } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { hashDoCorpo } from "./ordens-pelo-agente.service";

// Dados sintéticos: documento e UC na faixa 9999.
const corpo = { empresa: "waze", tipo: "manutencao", descricao: "Inversor sem comunicação", uc: "9999.555.001", origem: { canal: "telegram", grupo: "ENGENHARIA E OBRAS", solicitante: "Técnico" } };

describe("O.S. pelo robô: contrato e hash do pedido", () => {
  it("o hash não depende da ordem das chaves e muda com qualquer campo; é sha256, nunca o corpo", () => {
    const a = hashDoCorpo(criarOrdemPeloAgenteSchema.parse(corpo));
    const b = hashDoCorpo(criarOrdemPeloAgenteSchema.parse({ origem: corpo.origem, descricao: corpo.descricao, tipo: corpo.tipo, uc: corpo.uc, empresa: corpo.empresa }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoCorpo(criarOrdemPeloAgenteSchema.parse({ ...corpo, descricao: "Outro serviço" }))).not.toBe(a);
    expect(a).not.toContain("9999");
  });

  it("o documento vira só dígitos (CPF 11 ou CNPJ 14); canal só whatsapp ou telegram; nada fora do contrato", () => {
    expect(criarOrdemPeloAgenteSchema.parse({ ...corpo, documento: "99.991.234/0001-00" }).documento).toBe("99991234000100");
    expect(criarOrdemPeloAgenteSchema.safeParse({ ...corpo, documento: "9999123" }).success).toBe(false);
    expect(criarOrdemPeloAgenteSchema.safeParse({ ...corpo, origem: { ...corpo.origem, canal: "email" } }).success).toBe(false);
    expect(criarOrdemPeloAgenteSchema.safeParse({ ...corpo, clienteNome: "Fulano" }).success).toBe(false);
    // Sem UC nem documento o contrato aceita; o serviço responde 422 com o motivo.
    expect(criarOrdemPeloAgenteSchema.safeParse({ ...corpo, uc: undefined }).success).toBe(true);
  });
});
