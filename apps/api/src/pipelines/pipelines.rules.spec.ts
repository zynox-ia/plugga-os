import { createPipelineRequestSchema, pipelineParaEdicao, type Pipeline } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  alteracoes,
  idsDesconhecidos,
  idsRemovidos,
  podeConfigurar,
  podeCriarEm,
  podeVer,
  problemasDosDestinos,
  trocaEmpresaComNegocios,
  type AcessoComercial,
} from "./pipelines.rules";

const ANA = "00000000-0000-4000-8000-00000000000a";
const BRUNO = "00000000-0000-4000-8000-00000000000b";
const ETAPA_1 = "00000000-0000-4000-8000-000000000001";
const ETAPA_2 = "00000000-0000-4000-8000-000000000002";

const semAcesso: AcessoComercial = { admin: false, gestorEm: [] };
const gestorWaze: AcessoComercial = { admin: false, gestorEm: ["waze"] };
const admin: AcessoComercial = { admin: true, gestorEm: [] };

const solar = { companyId: "waze", members: [{ userId: ANA, role: "vendedor" as const }, { userId: BRUNO, role: "gestor" as const }] };

describe("quem alcança um pipeline", () => {
  it("o gestor comercial cria e configura só na própria empresa; o admin, em todas", () => {
    expect(podeCriarEm(gestorWaze, "waze")).toBe(true);
    expect(podeCriarEm(gestorWaze, "plugga")).toBe(false);
    expect(podeCriarEm(admin, "plugga")).toBe(true);
    expect(podeConfigurar(gestorWaze, "outra-pessoa", solar)).toBe(true);
    expect(podeConfigurar({ admin: false, gestorEm: ["plugga"] }, "outra-pessoa", solar)).toBe(false);
  });

  it("o vendedor da equipe vê, mas não configura", () => {
    expect(podeVer(semAcesso, ANA, solar)).toBe(true);
    expect(podeConfigurar(semAcesso, ANA, solar)).toBe(false);
  });

  it("o gestor do pipeline configura aquele pipeline", () => {
    expect(podeConfigurar(semAcesso, BRUNO, solar)).toBe(true);
  });

  it("quem não está na equipe nem gere a empresa não vê o pipeline", () => {
    expect(podeVer(semAcesso, "outra-pessoa", solar)).toBe(false);
  });
});

describe("listas substituídas por inteiro", () => {
  it("aponta ids que não são do pipeline e os que saíram da lista", () => {
    const itens = [{ id: ETAPA_2 }, {}, { id: "intruso" }];
    expect(idsDesconhecidos([ETAPA_1, ETAPA_2], itens)).toEqual(["intruso"]);
    expect(idsRemovidos([ETAPA_1, ETAPA_2], itens)).toEqual([ETAPA_1]);
  });
});

describe("contrato de criação", () => {
  const valido = {
    companyId: "waze",
    name: "Solar",
    description: "",
    valueLabel: "Investimento estimado",
    color: "#0b7a57",
    wonLabel: "Contrato assinado",
    lostLabel: "Perdido",
    stages: [{ name: "Qualificação", color: "#00a3ff", staleAfterDays: 7 }],
    tags: [],
    lossReasons: [],
    members: [],
  };

  it("normaliza descrição vazia e cor", () => {
    const pipeline = createPipelineRequestSchema.parse(valido);
    expect(pipeline.description).toBeNull();
    expect(pipeline.color).toBe("#0B7A57");
  });

  it("exige ao menos uma etapa e recusa nomes repetidos, sem diferenciar maiúsculas", () => {
    expect(createPipelineRequestSchema.safeParse({ ...valido, stages: [] }).success).toBe(false);
    const repetida = createPipelineRequestSchema.safeParse({
      ...valido,
      stages: [...valido.stages, { name: "qualificação ", color: "#00A3FF", staleAfterDays: null }],
    });
    expect(repetida.success).toBe(false);
    expect(repetida.error?.issues[0]?.path).toEqual(["stages", 1, "name"]);
  });

  it("recusa a mesma pessoa duas vezes na equipe", () => {
    const resultado = createPipelineRequestSchema.safeParse({
      ...valido,
      members: [{ userId: ANA, role: "vendedor" }, { userId: ANA, role: "gestor" }],
    });
    expect(resultado.success).toBe(false);
  });
});

describe("alterações para a auditoria", () => {
  const antes: Pipeline = {
    id: "00000000-0000-4000-8000-0000000000ff",
    companyId: "waze",
    name: "Solar",
    description: null,
    valueLabel: "Valor",
    color: "#0B7A57",
    wonLabel: "Ganho",
    lostLabel: "Perdido",
    archivedAt: null,
    updatedAt: "2026-10-19T10:00:00.000Z",
    updatedBy: null,
    stages: [
      { id: ETAPA_1, name: "Qualificação", color: "#00A3FF", position: 0, staleAfterDays: 7, dealCount: 2 },
      { id: ETAPA_2, name: "Proposta", color: "#7C5CFF", position: 1, staleAfterDays: null, dealCount: 0 },
    ],
    tags: [],
    lossReasons: [],
    members: [{ userId: ANA, name: "Ana", role: "vendedor" }],
    dealCount: 2,
    canConfigure: true,
  };
  const igual = pipelineParaEdicao(antes);

  it("nada mudou: nenhuma seção", () => {
    expect(alteracoes(antes, igual)).toEqual({ campos: [], secoes: [] });
  });

  it("lista os campos gerais e as seções alteradas, sem valores", () => {
    const depois = { ...igual, wonLabel: "Contrato assinado", stages: [...igual.stages].reverse() };
    expect(alteracoes(antes, depois)).toEqual({ campos: ["wonLabel"], secoes: ["geral", "etapas"] });
  });

  it("trocar o papel de alguém na equipe muda a equipe", () => {
    expect(alteracoes(antes, { ...igual, members: [{ userId: ANA, role: "gestor" }] }).secoes).toEqual(["equipe"]);
  });
});

describe("regras que dependem dos negócios", () => {
  const atuais = [
    { id: ETAPA_1, name: "Qualificação", dealCount: 3 },
    { id: ETAPA_2, name: "Proposta", dealCount: 0 },
  ];

  it("excluir etapa com negócios exige destino entre as etapas mantidas", () => {
    expect(problemasDosDestinos(atuais, [{ id: ETAPA_2 }], {})).toEqual(['Escolha para qual etapa vão os negócios de "Qualificação".']);
    expect(problemasDosDestinos(atuais, [{ id: ETAPA_2 }], { [ETAPA_1]: ETAPA_2 })).toEqual([]);
    expect(problemasDosDestinos(atuais, [{ id: ETAPA_2 }, {}], { [ETAPA_1]: ETAPA_1 })).toHaveLength(1);
  });

  it("excluir etapa vazia não pede destino", () => {
    expect(problemasDosDestinos(atuais, [{ id: ETAPA_1 }], {})).toEqual([]);
  });

  it("pipeline com negócios não troca de empresa; sem negócios, troca", () => {
    expect(trocaEmpresaComNegocios({ companyId: "waze", dealCount: 1 }, "plugga")).toBe(true);
    expect(trocaEmpresaComNegocios({ companyId: "waze", dealCount: 1 }, "waze")).toBe(false);
    expect(trocaEmpresaComNegocios({ companyId: "waze", dealCount: 0 }, "plugga")).toBe(false);
  });
});
