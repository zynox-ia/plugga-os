import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  listarProjetosSolaresDoLead,
  projetoParaRascunho,
  rascunhoParaCriacao,
  rascunhoProjetoSolarVazio,
  salvarProjetoSolarDoLead,
  tituloDoProjetoSolar,
  validarRascunhoProjetoSolar,
} from "../app/lib/projetos-solares-lead.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const completo = {
  installationType: "rural" as const,
  averageConsumptionKwh: "1.840,5",
  consumerUnit: "  004578912  ",
  beneficiaryUcs: [],
  energyBillDocumentIds: [id(1)],
  roofType: "metalico" as const,
  availableAreaM2: "190",
  estimatedPowerKwp: "15,2",
  estimatedInvestment: "117500,00",
};

test("valida só instalação, consumo e UC; telhado, área, potência e investimento são opcionais", () => {
  assert.deepEqual(validarRascunhoProjetoSolar(rascunhoProjetoSolarVazio()), {
    installationType: "Selecione o tipo de instalação.",
    averageConsumptionKwh: "Informe um número válido.",
    consumerUnit: "informe a UC",
  });
  assert.deepEqual(validarRascunhoProjetoSolar(completo), {});
  const minimo = { ...rascunhoProjetoSolarVazio(), installationType: "commercial" as const, averageConsumptionKwh: "300", consumerUnit: "UC-1" };
  assert.deepEqual(validarRascunhoProjetoSolar(minimo), {});
  assert.equal(validarRascunhoProjetoSolar({ ...minimo, availableAreaM2: "abc" }).availableAreaM2, "Informe um número válido.");
  assert.match(validarRascunhoProjetoSolar({ ...minimo, beneficiaryUcs: [{ id: id(3), code: "UC-1" }] }).beneficiaryUcs ?? "", /repetida/);
});

test("normaliza rascunho com a versão do lead, descarta beneficiária vazia e monta o título", () => {
  const criado = rascunhoParaCriacao({ ...completo, beneficiaryUcs: [{ id: id(4), code: " " }, { id: id(5), code: "UC-B" }] }, 7);
  assert.equal(criado.averageConsumptionKwh, "1840.5");
  assert.equal(criado.consumerUnit, "004578912");
  assert.equal(criado.version, 7);
  assert.deepEqual(criado.beneficiaryUcs, [{ id: id(5), code: "UC-B" }]);
  assert.equal(tituloDoProjetoSolar({ id: id(2), ...criado, createdAt: "2026-11-12T21:00:00.000Z", updatedAt: "2026-11-12T21:00:00.000Z" }), "Rural · UC 004578912");
  const opcional = rascunhoParaCriacao({ ...completo, roofType: "", availableAreaM2: "", estimatedPowerKwp: "", estimatedInvestment: "" }, 1);
  assert.equal(opcional.roofType, null);
  assert.equal(opcional.estimatedInvestment, null);
});

test("lista, cria e atualiza projetos via proxy, enviando a versão e recebendo o avanço", async () => {
  const { version, ...dados } = rascunhoParaCriacao(completo, 3);
  assert.equal(version, 3);
  const projeto = { id: id(2), ...dados, createdAt: "2026-11-12T21:00:00.000Z", updatedAt: "2026-11-12T21:00:00.000Z" };
  const chamadas: Array<{ url: string; method: string; versao?: number }> = [];
  globalThis.fetch = (async (entrada, init) => {
    const url = String(entrada);
    const method = init?.method ?? "GET";
    chamadas.push({ url, method, ...(init?.body ? { versao: JSON.parse(String(init.body)).version } : {}) });
    if (method === "GET") return new Response(JSON.stringify({ projects: [projeto] }), { status: 200, headers: { "content-type": "application/json" } });
    if (method === "PATCH") return new Response(JSON.stringify({ project: { ...projeto, consumerUnit: "UC-EDIT" }, advancedToProposal: false }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ project: projeto, advancedToProposal: true }), { status: 201, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  assert.deepEqual(await listarProjetosSolaresDoLead(id(9)), [projeto]);
  assert.deepEqual(await salvarProjetoSolarDoLead(id(9), null, completo, 3), { project: projeto, advancedToProposal: true });
  assert.equal((await salvarProjetoSolarDoLead(id(9), id(2), { ...completo, consumerUnit: "UC-EDIT" }, 4)).project.consumerUnit, "UC-EDIT");
  assert.equal(projetoParaRascunho(projeto).consumerUnit, "004578912");
  assert.deepEqual(chamadas, [
    { url: `/api/leads/${id(9)}/projetos-solares`, method: "GET" },
    { url: `/api/leads/${id(9)}/projetos-solares`, method: "POST", versao: 3 },
    { url: `/api/leads/${id(9)}/projetos-solares/${id(2)}`, method: "PATCH", versao: 4 },
  ]);
});

test("recusa do servidor chega como erro legível", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ codigo: "REQUISICAO_INVALIDA", mensagem: "Pendências do processo Solar: Anexe a conta de energia ao projeto." }), { status: 400, headers: { "content-type": "application/json" } })) as typeof fetch;
  await assert.rejects(salvarProjetoSolarDoLead(id(9), null, completo, 1), /Anexe a conta de energia/);
});
