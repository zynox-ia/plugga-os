import { createClientRequestSchema, updateClientRequestSchema } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { camposInformados, paraDetalhe, paraItemDeLista, problemasDaEdicao, type LinhaDeCliente } from "./clientes.rules";

// Documentos da faixa sintética do projeto (scripts/dados-sinteticos.mjs), com dígito verificador válido.
const CPF = "99999900100";
const CNPJ = "99999001000159";
const DONO = { id: "00000000-0000-4000-8000-000000000001", name: "Bruno" };

function linha(sobrescrever: Partial<LinhaDeCliente> = {}): LinhaDeCliente {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    personType: "pj",
    name: "Hotel Mirante do Rio",
    legalName: "Hotel Mirante do Rio Ltda",
    document: CNPJ,
    phone: "9230007700",
    email: "contato@mirante.example",
    postalCode: "69041010",
    street: "Av. do Turismo, 1500",
    addressComplement: null,
    district: "Tarumã",
    city: "Manaus",
    state: "AM",
    origin: "indicacao",
    notes: null,
    rg: null,
    rgIssuer: null,
    nationality: null,
    birthDate: null,
    active: true,
    createdAt: new Date("2026-10-19T10:00:00.000Z"),
    updatedAt: new Date("2026-10-19T11:00:00.000Z"),
    owner: DONO,
    contacts: [],
    ...sobrescrever,
  };
}

const contato = (nome: string, isPrimary: boolean, createdAt: string) => ({
  id: `00000000-0000-4000-8000-0000000002${nome.length.toString().padStart(2, "0")}`,
  name: nome,
  jobTitle: null,
  role: null,
  phone: null,
  phoneIsWhatsapp: false,
  email: null,
  isPrimary,
  cpf: null,
  rg: null,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
});

describe("paraItemDeLista (LGPD)", () => {
  it("mostra o CNPJ formatado, que é público, e mascara o telefone", () => {
    const item = paraItemDeLista(linha());
    expect(item.documentDisplay).toBe("99.999.001/0001-59");
    expect(item.phoneDisplay).toBe("(92) 3•••-7700");
  });

  it("mascara o CPF de pessoa física", () => {
    const item = paraItemDeLista(linha({ personType: "pf", document: CPF }));
    expect(item.documentDisplay).toBe("•••.999.001-••");
  });

  it("usa o contato principal e, sem principal, o primeiro contato", () => {
    const comPrincipal = linha({ contacts: [contato("Rodrigo", false, "2026-10-01"), contato("Juliana", true, "2026-10-02")] });
    expect(paraItemDeLista(comPrincipal).primaryContactName).toBe("Juliana");
    expect(paraItemDeLista(linha({ contacts: [contato("Rodrigo", false, "2026-10-01")] })).primaryContactName).toBe("Rodrigo");
    expect(paraItemDeLista(linha()).primaryContactName).toBeNull();
  });
});

describe("paraDetalhe", () => {
  it("devolve dados completos, com a data de nascimento como data de calendário", () => {
    const detalhe = paraDetalhe(linha({ personType: "pf", document: CPF, birthDate: "1985-03-07" }));
    expect(detalhe.document).toBe(CPF);
    expect(detalhe.phone).toBe("9230007700");
    expect(detalhe.birthDate).toBe("1985-03-07");
  });

  it("lista o contato principal primeiro e os demais por ordem de cadastro", () => {
    const detalhe = paraDetalhe(
      linha({ contacts: [contato("Bia", false, "2026-10-03"), contato("Rodrigo", false, "2026-10-01"), contato("Juliana", true, "2026-10-02")] }),
    );
    expect(detalhe.contacts.map((c) => c.name)).toEqual(["Juliana", "Rodrigo", "Bia"]);
  });
});

describe("problemasDaEdicao (regras depois de mesclar com o cadastro atual)", () => {
  it("aceita uma edição que mantém um canal de contato", () => {
    expect(problemasDaEdicao(linha(), { phone: null }, false)).toEqual([]);
  });

  it("recusa apagar o último telefone ou e-mail", () => {
    const problemas = problemasDaEdicao(linha({ email: null }), { phone: null }, false);
    expect(problemas.map((p) => p.campo)).toEqual(["phone"]);
  });

  it("confere o documento pelo tipo final: CNPJ não serve para pessoa física", () => {
    const problemas = problemasDaEdicao(linha(), { personType: "pf" }, false);
    expect(problemas.map((p) => p.campo)).toContain("document");
  });

  it("não deixa virar pessoa física com contatos cadastrados", () => {
    const problemas = problemasDaEdicao(linha({ document: null }), { personType: "pf" }, true);
    expect(problemas.map((p) => p.campo)).toEqual(["personType"]);
  });
});

describe("camposInformados (auditoria só com nomes de campo)", () => {
  it("lista as chaves com valor, inclusive as apagadas com null", () => {
    expect(camposInformados({ name: "X", phone: null, email: undefined })).toEqual(["name", "phone"]);
  });
});

describe("contrato de criação", () => {
  const base = { personType: "pj" as const, name: "Logística Igarapé" };

  it("cadastra prospect sem documento quando há telefone", () => {
    const resultado = createClientRequestSchema.safeParse({ ...base, phone: "(92) 99999-4120", document: "" });
    expect(resultado.success).toBe(true);
    expect(resultado.data?.phone).toBe("92999994120");
    expect(resultado.data?.document).toBeNull();
  });

  it("exige pelo menos um telefone ou e-mail", () => {
    const resultado = createClientRequestSchema.safeParse(base);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((i) => i.path.join("."))).toContain("phone");
  });

  it("recusa CNPJ com dígito verificador errado", () => {
    const resultado = createClientRequestSchema.safeParse({ ...base, email: "a@b.example", document: "99.999.001/0001-58" });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((i) => i.path.join("."))).toContain("document");
  });

  it("recusa CPF em cliente PJ e aceita em PF", () => {
    expect(createClientRequestSchema.safeParse({ ...base, email: "a@b.example", document: CPF }).success).toBe(false);
    expect(createClientRequestSchema.safeParse({ ...base, personType: "pf", email: "a@b.example", document: CPF }).success).toBe(true);
  });

  it("recusa dados para contrato em PJ e contato em PF", () => {
    expect(createClientRequestSchema.safeParse({ ...base, email: "a@b.example", rg: "1234567" }).success).toBe(false);
    expect(
      createClientRequestSchema.safeParse({ ...base, personType: "pf", email: "a@b.example", primaryContact: { name: "Ana" } }).success,
    ).toBe(false);
  });

  it("nunca aceita a data de nascimento fictícia do Bitrix", () => {
    const resultado = createClientRequestSchema.safeParse({ ...base, personType: "pf", email: "a@b.example", birthDate: "1900-01-01" });
    expect(resultado.success).toBe(false);
  });

  it("na edição, string vazia apaga o campo", () => {
    expect(updateClientRequestSchema.parse({ legalName: "" }).legalName).toBeNull();
  });
});
