import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acessoSchema,
  alcancaDepartamento,
  alcancaPlataforma,
  nivelNoDepartamento,
  type Acesso,
} from "../src/acesso.ts";

const ADMIN: Acesso = { plataforma: "admin", departamentos: [] };
const DESENVOLVEDOR: Acesso = { plataforma: "desenvolvedor", departamentos: [] };
const EQUIPE: Acesso = {
  plataforma: null,
  departamentos: [
    { departamento: "crm", nivel: "membro" },
    { departamento: "suprimentos", nivel: "gerente" },
  ],
};

describe("acessoSchema", () => {
  it("aceita membro e gerente em departamentos diferentes", () => {
    assert.equal(acessoSchema.safeParse(EQUIPE).success, true);
  });

  it("recusa departamentos para papel de plataforma", () => {
    const resultado = acessoSchema.safeParse({
      plataforma: "admin",
      departamentos: [{ departamento: "crm", nivel: "membro" }],
    });
    assert.equal(resultado.success, false);
  });

  it("recusa o mesmo departamento duas vezes", () => {
    const resultado = acessoSchema.safeParse({
      plataforma: null,
      departamentos: [
        { departamento: "crm", nivel: "membro" },
        { departamento: "crm", nivel: "gerente" },
      ],
    });
    assert.equal(resultado.success, false);
  });

  it("recusa departamento fora do catálogo novo", () => {
    const resultado = acessoSchema.safeParse({
      plataforma: null,
      departamentos: [{ departamento: "comercial-clientes", nivel: "membro" }],
    });
    assert.equal(resultado.success, false);
  });
});

describe("alcancaPlataforma", () => {
  it("desenvolvedor alcança o que é do admin, e o admin não alcança o desenvolvedor", () => {
    assert.equal(alcancaPlataforma(DESENVOLVEDOR, "admin"), true);
    assert.equal(alcancaPlataforma(DESENVOLVEDOR, "desenvolvedor"), true);
    assert.equal(alcancaPlataforma(ADMIN, "admin"), true);
    assert.equal(alcancaPlataforma(ADMIN, "desenvolvedor"), false);
  });

  it("equipe de departamento não alcança a plataforma", () => {
    assert.equal(alcancaPlataforma(EQUIPE, "admin"), false);
  });
});

describe("alcancaDepartamento", () => {
  it("membro opera o próprio departamento, mas não aprova", () => {
    assert.equal(alcancaDepartamento(EQUIPE, "crm"), true);
    assert.equal(alcancaDepartamento(EQUIPE, "crm", "gerente"), false);
  });

  it("gerente opera e aprova o próprio departamento", () => {
    assert.equal(alcancaDepartamento(EQUIPE, "suprimentos"), true);
    assert.equal(alcancaDepartamento(EQUIPE, "suprimentos", "gerente"), true);
  });

  it("fora dos próprios departamentos não alcança nada", () => {
    assert.equal(alcancaDepartamento(EQUIPE, "financeiro"), false);
    assert.equal(nivelNoDepartamento(EQUIPE, "financeiro"), null);
  });

  it("admin e desenvolvedor aprovam em qualquer departamento", () => {
    assert.equal(alcancaDepartamento(ADMIN, "financeiro", "gerente"), true);
    assert.equal(alcancaDepartamento(DESENVOLVEDOR, "engenharia-obras", "gerente"), true);
  });
});
