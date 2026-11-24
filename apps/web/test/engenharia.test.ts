import assert from "node:assert/strict";
import { test } from "node:test";

import { diaPorExtenso, ehTipoDeOrdem, lerPrazoPadrao, notaDasAtrasadas, notaDoCampoHoje, textoDoPrazoPadrao } from "../app/lib/engenharia.ts";

test("dia por extenso no cabeçalho da Visão geral", () => {
  assert.equal(diaPorExtenso("2026-11-23"), "Segunda, 23 de novembro");
  assert.equal(diaPorExtenso("2026-03-01"), "Domingo, 1 de março");
});

test("prazo padrão dos tipos: texto e o que se digita", () => {
  assert.equal(textoDoPrazoPadrao(0), "no mesmo dia");
  assert.equal(textoDoPrazoPadrao(1), "1 dia útil");
  assert.equal(textoDoPrazoPadrao(3), "3 dias úteis");
  assert.deepEqual(lerPrazoPadrao(" 5 "), { valor: 5, problema: null });
  assert.deepEqual(lerPrazoPadrao("0"), { valor: 0, problema: null });
  assert.deepEqual(lerPrazoPadrao("31"), { valor: null, problema: "use um número de 0 a 30." });
  assert.deepEqual(lerPrazoPadrao("2,5"), { valor: null, problema: "use um número de 0 a 30." });
  assert.deepEqual(lerPrazoPadrao(""), { valor: null, problema: "use um número de 0 a 30." });
  assert.equal(ehTipoDeOrdem("limpeza"), true);
  assert.equal(ehTipoDeOrdem("../x"), false);
});

test("notas dos metric cards da Visão geral", () => {
  assert.equal(notaDasAtrasadas(0, [], "2026-11-23"), "nenhuma atrasada");
  assert.equal(notaDasAtrasadas(2, [{ prazo: "2026-11-21" }, { prazo: "2026-11-20" }], "2026-11-23"), "a mais antiga há 3 dias");
  assert.equal(notaDasAtrasadas(1, [{ prazo: "2026-11-23" }], "2026-11-23"), "vencem hoje");
  assert.equal(notaDoCampoHoje([]), "ninguém em campo");
  const igor = { id: "a", nome: "Igor Nascimento" };
  const jan = { id: "b", nome: "Janderson Maciel" };
  // A nota segue a contagem da API: só quem está em campo; as agendadas para hoje não entram nos nomes.
  assert.equal(notaDoCampoHoje([{ tecnico: igor, situacao: "em_campo" }, { tecnico: igor, situacao: "em_campo" }, { tecnico: jan, situacao: "em_campo" }, { tecnico: { id: "c", nome: "Marcus Vinicius" }, situacao: "agendada" }]), "Igor, Janderson");
  assert.equal(notaDoCampoHoje([{ tecnico: igor, situacao: "agendada" }, { tecnico: jan, situacao: "agendada" }]), "2 agendadas para hoje");
  assert.equal(notaDoCampoHoje([{ tecnico: null, situacao: "em_campo" }]), "técnico em campo");
});
