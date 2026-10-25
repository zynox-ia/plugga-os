import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acessoSchema,
  alcancaDepartamento,
  alcancaPlataforma,
  converterAcessoAntigo,
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

describe("converterAcessoAntigo", () => {
  it("admin de plataforma continua admin e perde as linhas de departamento", () => {
    assert.deepEqual(
      converterAcessoAntigo({
        platformRoles: ["admin"],
        companies: [
          { companyId: "plugga", roles: ["viewer"], departments: [{ departmentId: "financeiro", isManager: false }] },
        ],
      }),
      ADMIN,
    );
  });

  it("gestor vira gerente e o restante vira membro", () => {
    assert.deepEqual(
      converterAcessoAntigo({
        platformRoles: [],
        companies: [
          {
            companyId: "plugga",
            roles: ["opm"],
            departments: [
              { departmentId: "energia-opm", isManager: true },
              { departmentId: "financeiro", isManager: false },
            ],
          },
        ],
      }),
      {
        plataforma: null,
        departamentos: [
          { departamento: "energia-opm", nivel: "gerente" },
          { departamento: "financeiro", nivel: "membro" },
        ],
      },
    );
  });

  it("diretoria vira gerente dos departamentos que já acessava naquela empresa", () => {
    assert.deepEqual(
      converterAcessoAntigo({
        platformRoles: [],
        companies: [
          { companyId: "plugga", roles: ["diretoria"], departments: [{ departmentId: "financeiro", isManager: false }] },
          { companyId: "waze", roles: ["viewer"], departments: [{ departmentId: "engenharia-obras", isManager: false }] },
        ],
      }),
      {
        plataforma: null,
        departamentos: [
          { departamento: "financeiro", nivel: "gerente" },
          { departamento: "engenharia-obras", nivel: "membro" },
        ],
      },
    );
  });

  it("os dois comerciais viram um CRM só, com o nível mais alto entre as empresas", () => {
    assert.deepEqual(
      converterAcessoAntigo({
        platformRoles: [],
        companies: [
          { companyId: "plugga", roles: ["comercial"], departments: [{ departmentId: "comercial-clientes", isManager: true }] },
          { companyId: "waze", roles: ["comercial"], departments: [{ departmentId: "comercial-obras", isManager: false }] },
        ],
      }),
      { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] },
    );
  });

  it("tech não vira desenvolvedor por conversão", () => {
    assert.deepEqual(
      converterAcessoAntigo({
        platformRoles: [],
        companies: [
          { companyId: "plugga", roles: ["tech"], departments: [{ departmentId: "produto-tecnologia", isManager: false }] },
        ],
      }),
      { plataforma: null, departamentos: [{ departamento: "produto-tecnologia", nivel: "membro" }] },
    );
  });

  it("empresa sem departamento não gera acesso nenhum", () => {
    assert.deepEqual(
      converterAcessoAntigo({
        platformRoles: [],
        companies: [{ companyId: "waze", roles: ["viewer"], departments: [] }],
      }),
      { plataforma: null, departamentos: [] },
    );
  });
});
