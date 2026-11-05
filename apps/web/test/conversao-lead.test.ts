import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Deal } from "@plugga/shared";
import { lerErro } from "../app/lib/clientes.ts";
import { converterLead, dadosDeConversao, erroCampoConversao } from "../app/lib/conversao-lead.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const negocio: Deal = {
  id: "00000000-0000-4000-8000-000000001001", number: 1,
  pipelineId: "00000000-0000-4000-8000-000000001002", companyId: "plugga", stageId: "00000000-0000-4000-8000-000000001003",
  status: "open", priority: null, title: "Projeto sintético", value: null, expectedCloseDate: null,
  lead: { personType: "pj", name: "Lead sintético", companyName: null, landlinePhone: null, website: null, mainInterest: null, jobTitle: null, legalName: null, document: null, phone: null, email: "lead@teste.local", postalCode: null, street: null, addressComplement: null, district: null, city: null, state: null, origin: null, notes: null },
  owner: { id: "00000000-0000-4000-8000-000000001004", name: "Responsável sintético" },
  contact: null, client: null, tags: [], stageEnteredAt: "2026-11-05T12:00:00Z", closedAt: null, lossReason: null, revisitOn: null, createdAt: "2026-11-05T12:00:00Z",
};

test("associa cada erro lead.campo à entrada correta da conversão", () => {
  const erros = lerErro({ detalhes: [
    { campo: "lead.name", problema: "Informe o nome" },
    { campo: "lead.document", problema: "Documento inválido" },
    { campo: "lead.phone", problema: "Telefone inválido" },
    { campo: "lead.email", problema: "E-mail inválido" },
  ] }, "Falha").porCampo;
  assert.equal(erroCampoConversao(erros, "name"), "Informe o nome");
  assert.equal(erroCampoConversao(erros, "document"), "Documento inválido");
  assert.equal(erroCampoConversao(erros, "phone"), "Telefone inválido");
  assert.equal(erroCampoConversao(erros, "email"), "E-mail inválido");
  assert.equal(erroCampoConversao({ nome: "Alias legado" }, "name"), "Alias legado");
  assert.equal(erroCampoConversao({}, "phone"), undefined);
});

test("publica o perfil salvo antes da conversão recusada e mantém o rascunho", async () => {
  const rascunho = { ...dadosDeConversao(negocio.lead), nome: "Lead corrigido" };
  const salvo = { ...negocio, lead: { ...negocio.lead, name: rascunho.nome } };
  const eventos: string[] = [];
  globalThis.fetch = async (_url, init) => {
    eventos.push(init!.method!);
    return init?.method === "PATCH" ? Response.json(salvo) : Response.json({ mensagem: "Informe o documento", detalhes: [{ campo: "lead.document", problema: "Documento obrigatório" }] }, { status: 400 });
  };
  const resultado = await converterLead(negocio, rascunho, "", (atualizado) => { eventos.push(`perfil:${atualizado.lead.name}`); });
  assert.deepEqual(eventos, ["PATCH", "perfil:Lead corrigido", "POST"]);
  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("A conversão deveria ser recusada");
  assert.equal(erroCampoConversao(resultado.erro.porCampo, "document"), "Documento obrigatório");
  assert.equal(rascunho.nome, "Lead corrigido");
  assert.equal(negocio.lead.name, "Lead sintético");
});

test("PATCH recusado não converte nem anuncia perfil salvo", async () => {
  const rascunho = { ...dadosDeConversao(negocio.lead), email: "inválido" };
  const metodos: string[] = [];
  let atualizou = false;
  globalThis.fetch = async (_url, init) => {
    metodos.push(init!.method!);
    return Response.json({ detalhes: [{ campo: "lead.email", problema: "E-mail inválido" }] }, { status: 400 });
  };
  const resultado = await converterLead(negocio, rascunho, "", () => { atualizou = true; });
  assert.equal(resultado.ok, false);
  assert.deepEqual(metodos, ["PATCH"]);
  assert.equal(atualizou, false);
  assert.equal(rascunho.email, "inválido");
});

test("nova tentativa usa o perfil já salvo e preserva escolha de duplicidade", async () => {
  const candidato = { id: "00000000-0000-4000-8000-000000001005", name: "Cliente sintético", personType: "pj", matchedOn: ["email"] };
  const salvo = { ...negocio, lead: { ...negocio.lead, name: "Nome salvo" } };
  let atual = negocio;
  const chamadas: { metodo?: string; corpo: unknown }[] = [];
  let tentativas = 0;
  globalThis.fetch = async (_url, init) => {
    chamadas.push({ metodo: init?.method, corpo: JSON.parse(String(init?.body)) });
    if (init?.method === "PATCH") return Response.json(salvo);
    if (++tentativas === 1) return Response.json({ mensagem: "Escolha o cliente", candidatos: [candidato] }, { status: 400 });
    return Response.json({ lead: { ...salvo, client: { id: candidato.id, name: candidato.name } }, client: { id: candidato.id, name: candidato.name }, created: false });
  };
  const atualizar = (perfil: Deal) => { atual = perfil; };
  const recusada = await converterLead(atual, dadosDeConversao(salvo.lead), "", atualizar);
  assert.equal(recusada.ok, false);
  if (recusada.ok) throw new Error("A duplicidade deveria exigir escolha");
  assert.equal(recusada.erro.candidatos?.[0]?.id, candidato.id);
  const convertida = await converterLead(atual, dadosDeConversao(salvo.lead), candidato.id, atualizar);
  assert.equal(convertida.ok, true);
  assert.deepEqual(chamadas.map(({ metodo }) => metodo), ["PATCH", "POST", "POST"]);
  assert.deepEqual(chamadas[2]?.corpo, { resolution: { type: "link", clientId: candidato.id } });
});

test("conversão sem edição não salva perfil e permite criar cliente após escolha", async () => {
  let alterou = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `/api/leads/${negocio.id}/converter`);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { resolution: { type: "create" } });
    return Response.json({ lead: negocio, client: { id: "00000000-0000-4000-8000-000000001005", name: "Cliente sintético" }, created: true });
  };
  const resultado = await converterLead(negocio, dadosDeConversao(negocio.lead), "novo", () => { alterou = true; });
  assert.equal(resultado.ok, true);
  assert.equal(alterou, false);
});
