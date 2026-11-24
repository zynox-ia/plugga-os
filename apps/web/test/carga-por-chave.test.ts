import assert from "node:assert/strict";
import { test } from "node:test";
import { cargaParaRender, iniciarCarga } from "../app/lib/carga-por-chave.ts";

/** Resolve só quando chamado explicitamente, para controlar a ordem das respostas no teste. */
function promessaControlada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => { resolver = resolve; });
  return { promessa, resolver };
}

test("resposta atrasada do negócio anterior não aparece depois de trocar de negócio", () => {
  // Negócio A já carregou; o efeito guardou a carga sob a chave do negócio A.
  const cargaDoNegocioA = { estado: "ok" as const, dados: [{ id: "projeto-a" }] };
  // O render já trocou para o negócio B, mas o efeito da nova consulta ainda não concluiu
  // (a resposta do fetch de B está atrasada) — a chave guardada ainda é a de A.
  const renderAntesDoEfeito = cargaParaRender("negocio-a:1:true", "negocio-b:1:true", cargaDoNegocioA, true);
  assert.deepEqual(renderAntesDoEfeito, { estado: "carregando", dados: [] });

  // Quando o efeito do negócio B concluir e guardar sob a chave de B, o render volta a mostrar o dado.
  const cargaDoNegocioB = { estado: "ok" as const, dados: [{ id: "projeto-b" }] };
  const renderDepoisDoEfeito = cargaParaRender("negocio-b:1:true", "negocio-b:1:true", cargaDoNegocioB, true);
  assert.deepEqual(renderDepoisDoEfeito, cargaDoNegocioB);
});

test("troca de versão do mesmo negócio também limpa o dado antigo até a nova consulta concluir", () => {
  const versaoAnterior = { estado: "ok" as const, dados: [{ id: "projeto-v1" }] };
  assert.deepEqual(cargaParaRender("negocio-a:1:true", "negocio-a:2:true", versaoAnterior, true), { estado: "carregando", dados: [] });
});

test("desabilitado (fora do Solar) nunca mostra carregando, só \"ok\" vazio enquanto a chave não bate", () => {
  const cargaQualquer = { estado: "erro" as const, dados: [] };
  assert.deepEqual(cargaParaRender("negocio-a:1:false", "negocio-b:1:false", cargaQualquer, false), { estado: "ok", dados: [] });
});

test("chave igual preserva a carga guardada, mesmo em erro", () => {
  const comErro = { estado: "erro" as const, dados: [] };
  assert.deepEqual(cargaParaRender("negocio-a:1:true", "negocio-a:1:true", comErro, true), comErro);
});

test("iniciarCarga chama aoResolver com a chave e os dados quando a consulta conclui", async () => {
  const resultados: unknown[] = [];
  const { promessa, resolver } = promessaControlada<{ id: string }[]>();
  iniciarCarga("negocio-a:1:true", "negocio-a", () => promessa, (r) => resultados.push(r));
  resolver([{ id: "projeto-a" }]);
  await promessa;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(resultados, [{ chave: "negocio-a:1:true", carga: { estado: "ok", dados: [{ id: "projeto-a" }] } }]);
});

test("cancelar antes da resposta chegar impede aoResolver (abort)", async () => {
  const resultados: unknown[] = [];
  const { promessa, resolver } = promessaControlada<{ id: string }[]>();
  const cancelar = iniciarCarga("negocio-a:1:true", "negocio-a", () => promessa, (r) => resultados.push(r));
  cancelar();
  resolver([{ id: "projeto-a" }]);
  await promessa;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(resultados, []);
});

test("resposta de A atrasada depois da troca para B não aparece (abort real de efeito)", async () => {
  const resultados: { chave: string; carga: unknown }[] = [];
  const a = promessaControlada<{ id: string }[]>();
  // Efeito de A monta; antes de A responder, negocioId/versão trocam — o cleanup cancela A.
  const cancelarA = iniciarCarga("negocio-a:1:true", "negocio-a", () => a.promessa, (r) => resultados.push(r));
  cancelarA();

  const b = promessaControlada<{ id: string }[]>();
  iniciarCarga("negocio-b:1:true", "negocio-b", () => b.promessa, (r) => resultados.push(r));
  b.resolver([{ id: "projeto-b" }]);
  await b.promessa;
  await new Promise((r) => setTimeout(r, 0));

  // A só responde agora, bem depois de cancelada — não pode sobrescrever o estado de B.
  a.resolver([{ id: "projeto-a" }]);
  await a.promessa;
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(resultados, [{ chave: "negocio-b:1:true", carga: { estado: "ok", dados: [{ id: "projeto-b" }] } }]);
});

test("rejeição da consulta cancelada também não chama aoResolver", async () => {
  const resultados: unknown[] = [];
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<{ id: string }[]>((_resolve, reject) => { rejeitar = reject; });
  const cancelar = iniciarCarga("negocio-a:1:true", "negocio-a", () => promessa, (r) => resultados.push(r));
  cancelar();
  rejeitar(new Error("falha de rede"));
  await promessa.catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(resultados, []);
});

test("rejeição da consulta não cancelada vira estado de erro", async () => {
  const resultados: unknown[] = [];
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<{ id: string }[]>((_resolve, reject) => { rejeitar = reject; });
  iniciarCarga("negocio-a:1:true", "negocio-a", () => promessa, (r) => resultados.push(r));
  rejeitar(new Error("falha de rede"));
  await promessa.catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(resultados, [{ chave: "negocio-a:1:true", carga: { estado: "erro", dados: [] } }]);
});
