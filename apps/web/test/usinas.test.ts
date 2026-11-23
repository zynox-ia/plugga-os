import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consultaDasUsinas,
  contagemDeUsinas,
  hrefDasUsinas,
  kwpLegivel,
  lerPotencia,
  lerFiltrosDasUsinas,
  linhaDaConferencia,
  mudarSituacao,
  problemaDoArquivoDoPrint,
  resultadosDaConferencia,
  rotuloDaUc,
  situacaoNaConferenciaFeita,
  urlDaApi,
} from "../app/lib/usinas.ts";

const U1 = "3f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
const U2 = "4f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";

test("filtros pelo endereço: Monitoramento por padrão; a busca e a plataforma só valem no Cadastro", () => {
  assert.deepEqual(lerFiltrosDasUsinas({}), { aba: "monitoramento" });
  assert.deepEqual(lerFiltrosDasUsinas({ aba: "x", empresa: "outra", plataforma: "../auth", atencao: "1" }), { aba: "monitoramento" });
  const f = lerFiltrosDasUsinas({ aba: "cadastro", empresa: "waze", busca: " Hotel ", plataforma: "fusion-solar", atencao: "sim" });
  assert.deepEqual(f, { aba: "cadastro", empresa: "waze", busca: "Hotel", plataformaId: "fusion-solar", atencao: true });
  const href = hrefDasUsinas(f, U1);
  assert.equal(href, `/engenharia/usinas?aba=cadastro&empresa=waze&busca=Hotel&plataforma=fusion-solar&atencao=sim&usina=${U1}`);
  assert.deepEqual(lerFiltrosDasUsinas(Object.fromEntries(new URL(`http://x${href}`).searchParams)), f);
  assert.equal(hrefDasUsinas({ aba: "monitoramento", busca: "x", empresa: "plugga" }), "/engenharia/usinas?empresa=plugga");
  assert.deepEqual(consultaDasUsinas(f), { empresa: "waze", busca: "Hotel", plataformaId: "fusion-solar", atencao: "sim" });
});

test("textos: kWp em pt-BR, contagem e a linha da conferência", () => {
  assert.equal(kwpLegivel("12.4"), "12,4");
  assert.equal(kwpLegivel("1250"), "1.250");
  assert.equal(contagemDeUsinas(1), "1 usina");
  assert.equal(contagemDeUsinas(2), "2 usinas");
  assert.equal(linhaDaConferencia({ conferencia: null }), "Ainda não conferida hoje");
  const conferencia = { id: U1, conferida: { por: { id: U2, nome: "Marcus Vinicius" }, em: "2026-11-23T13:12:00.000Z" }, print: { id: U1, nome: "p.png", tamanhoBytes: 1, mime: "image/png", url: "/x" }, normais: 1, excecoes: [] };
  assert.equal(linhaDaConferencia({ conferencia }), "Conferida às 09:12 por Marcus Vinicius");
  assert.equal(urlDaApi("/engenharia/monitoramento/conferencias/a/print"), "/api/engenharia/monitoramento/conferencias/a/print");
});

test("marcar a situação: anomalia já pede O.S.; normal limpa a nota; sem tela de O.S., nunca pede", () => {
  const atual = { situacao: "normal" as const, nota: "", abrirOs: false };
  assert.deepEqual(mudarSituacao(atual, "anomalia", true), { situacao: "anomalia", nota: "", abrirOs: true });
  assert.deepEqual(mudarSituacao(atual, "sem_comunicacao", true), { situacao: "sem_comunicacao", nota: "", abrirOs: false });
  assert.deepEqual(mudarSituacao(atual, "anomalia", false), { situacao: "anomalia", nota: "", abrirOs: false });
  assert.deepEqual(mudarSituacao({ situacao: "anomalia", nota: "geração baixa", abrirOs: true }, "normal", true), { situacao: "normal", nota: "", abrirOs: false });
});

test("conferir: print obrigatório, nota obrigatória na exceção, e só as exceções vão", () => {
  const print = { name: "p.png", type: "image/png", size: 10 } as unknown as File;
  const normal = { situacao: "normal" as const, nota: "", abrirOs: false };
  const sem = resultadosDaConferencia({ [U1]: normal, [U2]: { situacao: "anomalia", nota: " ", abrirOs: true } }, null);
  assert.equal(sem.resultados, null);
  assert.equal(sem.problemas.print, "anexe o print da plataforma.");
  assert.equal(sem.problemas.notas[U2], "descreva o que foi visto na plataforma.");
  const ok = resultadosDaConferencia({ [U1]: normal, [U2]: { situacao: "anomalia", nota: " Geração 40% abaixo ", abrirOs: true } }, print);
  assert.deepEqual(ok.resultados, [{ usinaId: U2, situacao: "anomalia", nota: "Geração 40% abaixo", abrirOs: true }]);
  assert.deepEqual(resultadosDaConferencia({ [U1]: normal }, print).resultados, []);
  assert.equal(problemaDoArquivoDoPrint({ type: "text/plain", size: 1 }), "envie o print em JPG, PNG ou PDF.");
  assert.equal(problemaDoArquivoDoPrint({ type: "application/pdf", size: 26 * 1024 * 1024 }), "o print passa de 25 MB.");
});

test("potência digitada como no contrato: vírgula ou ponto, até 3 casas, maior que zero", () => {
  assert.deepEqual(lerPotencia(" 12,75 "), { valor: "12.75", problema: null });
  assert.deepEqual(lerPotencia("82"), { valor: "82", problema: null });
  assert.deepEqual(lerPotencia("1.250"), { valor: "1.250", problema: null });
  assert.deepEqual(lerPotencia("0"), { valor: null, problema: "a potência precisa ser maior que zero." });
  assert.deepEqual(lerPotencia("12,7555"), { valor: null, problema: "use um número como 12,75." });
  assert.deepEqual(lerPotencia("abc"), { valor: null, problema: "use um número como 12,75." });
});

test("conferência fechada: exceção, normal, e a usina cadastrada depois fica não conferida", () => {
  const U3 = "5f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
  const excecoes = [{ usinaId: U1, usina: "Usina 1", situacao: "anomalia" as const, nota: "Inversor parado", ordem: null }];
  const conferencia = { excecoes, usinasConferidas: [U1, U2] };
  assert.equal(situacaoNaConferenciaFeita(U1, conferencia), "anomalia");
  assert.equal(situacaoNaConferenciaFeita(U2, conferencia), "normal");
  assert.equal(situacaoNaConferenciaFeita(U3, conferencia), "nao_conferida");
  // Sem a lista (API anterior), toda usina sem exceção conta como normal.
  assert.equal(situacaoNaConferenciaFeita(U3, { excecoes }), "normal");
});

test("rótulo da UC: põe o prefixo só quando o código não começa com UC", () => {
  assert.equal(rotuloDaUc("1234567"), "UC 1234567");
  assert.equal(rotuloDaUc("UC-E2E-0001"), "UC-E2E-0001");
  assert.equal(rotuloDaUc("uc 998"), "uc 998");
  assert.equal(rotuloDaUc("UCX-1"), "UC UCX-1");
});
