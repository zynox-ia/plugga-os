import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sessionUserSchema } from "@plugga/shared";

import { caminhoCompleto, decidirPagina, destinoAoVoltar, destinoDoAviso, destinoDoParametro, lerSessaoDaApi, type LeituraDaSessao } from "../app/lib/sessao-do-middleware.ts";

const USUARIO = sessionUserSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  email: "pessoa@plugga.local",
  name: "Pessoa (sintético)",
  status: "active",
  acesso: { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro" }] },
});

/** Um fetch falso que devolve a resposta (ou lança o erro) pedida. */
const buscarCom = (resposta: Response | Error): typeof fetch => (async () => {
  if (resposta instanceof Error) throw resposta;
  return resposta;
}) as unknown as typeof fetch;

const ler = (resposta: Response | Error, cookie: string | null = "sessao=abc") =>
  lerSessaoDaApi({ cookie, base: "http://api.local", tempoMs: 50, buscar: buscarCom(resposta) });

describe("lerSessaoDaApi: só 401/403 são sem sessão (PLU-343)", () => {
  it("sem cookie é sem sessão, sem perguntar à API", async () => {
    let chamou = false;
    const leitura = await lerSessaoDaApi({ cookie: null, base: "http://api.local", tempoMs: 50, buscar: (async () => { chamou = true; return new Response(); }) as unknown as typeof fetch });
    assert.deepEqual(leitura, { tipo: "semSessao" });
    assert.equal(chamou, false);
  });

  it("200 com o contrato: autenticado; 200 fora do contrato: indisponível", async () => {
    assert.deepEqual(await ler(Response.json(USUARIO)), { tipo: "autenticado", usuario: USUARIO });
    assert.deepEqual(await ler(Response.json({ qualquer: "coisa" })), { tipo: "indisponivel", motivo: "contrato" });
    assert.deepEqual(await ler(new Response("não é json", { status: 200 })), { tipo: "indisponivel", motivo: "contrato" });
  });

  it("401 e 403: sem sessão", async () => {
    assert.deepEqual(await ler(new Response(null, { status: 401 })), { tipo: "semSessao" });
    assert.deepEqual(await ler(new Response(null, { status: 403 })), { tipo: "semSessao" });
  });

  it("503, 500 e outras recusas: indisponível, sem deslogar", async () => {
    for (const status of [503, 500, 502, 429, 404]) {
      assert.deepEqual(await ler(new Response(null, { status })), { tipo: "indisponivel", motivo: "servidor" }, String(status));
    }
  });

  it("tempo esgotado: indisponível por tempo", async () => {
    const erro = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    assert.deepEqual(await ler(erro as unknown as Error), { tipo: "indisponivel", motivo: "tempo" });
    const lento = (async (_url: string, init?: RequestInit) => new Promise<Response>((_, rejeitar) => {
      init?.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
    })) as unknown as typeof fetch;
    assert.deepEqual(await lerSessaoDaApi({ cookie: "sessao=abc", base: "http://api.local", tempoMs: 20, buscar: lento }), { tipo: "indisponivel", motivo: "tempo" });
  });

  it("conexão recusada: indisponível por rede", async () => {
    const recusada = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3001"), { code: "ECONNREFUSED" }) });
    assert.deepEqual(await ler(recusada), { tipo: "indisponivel", motivo: "rede" });
  });
});

describe("decidirPagina", () => {
  const autenticado: LeituraDaSessao = { tipo: "autenticado", usuario: USUARIO };
  const pode = () => true;

  it("API indisponível mostra o aviso no mesmo endereço, em vez de mandar ao login", () => {
    assert.deepEqual(decidirPagina("/suprimentos/estoque", { tipo: "indisponivel", motivo: "rede" }, pode), { acao: "indisponivel" });
    assert.deepEqual(decidirPagina("/", { tipo: "indisponivel", motivo: "tempo" }, pode), { acao: "indisponivel" });
  });

  it("sem sessão vai ao login guardando o destino (menos a página inicial)", () => {
    assert.deepEqual(decidirPagina("/suprimentos/estoque", { tipo: "semSessao" }, pode), { acao: "login", redirectTo: "/suprimentos/estoque" });
    assert.deepEqual(decidirPagina("/", { tipo: "semSessao" }, pode), { acao: "login", redirectTo: null });
  });

  it("autenticado segue; sem acesso à página, volta ao início; o aviso sempre abre", () => {
    assert.deepEqual(decidirPagina("/clientes", autenticado, pode), { acao: "seguir" });
    assert.deepEqual(decidirPagina("/clientes", autenticado, () => false), { acao: "inicio" });
    assert.deepEqual(decidirPagina("/indisponivel", autenticado, () => false), { acao: "seguir" });
  });

  it("no /login: autenticado vai ao início; sem sessão ou com a API fora, o formulário aparece", () => {
    assert.deepEqual(decidirPagina("/login", autenticado, pode), { acao: "inicio" });
    assert.deepEqual(decidirPagina("/login", { tipo: "semSessao" }, pode), { acao: "seguir" });
    assert.deepEqual(decidirPagina("/login", { tipo: "indisponivel", motivo: "servidor" }, pode), { acao: "seguir" });
  });
});

describe("destino quando a API volta", () => {
  it("?de= vence; senão o próprio endereço; aberto direto, a página inicial", () => {
    assert.equal(destinoAoVoltar("/suprimentos/compras", "/indisponivel", ""), "/suprimentos/compras");
    assert.equal(destinoAoVoltar(null, "/suprimentos/estoque", "?visao=lista"), "/suprimentos/estoque?visao=lista");
    assert.equal(destinoAoVoltar(null, "/indisponivel", ""), "/");
  });
});

describe("destino com a query (PLU-343, reteste do QA)", () => {
  const ficha = "/suprimentos/fornecedores?fornecedor=22222222-2222-4222-8222-222222222222";

  it("sem sessão, o redirectTo do login guarda caminho e query", () => {
    assert.deepEqual(decidirPagina("/suprimentos/fornecedores", { tipo: "semSessao" }, () => true, "?fornecedor=22222222-2222-4222-8222-222222222222"), { acao: "login", redirectTo: ficha });
    assert.deepEqual(decidirPagina("/", { tipo: "semSessao" }, () => true, "?x=1"), { acao: "login", redirectTo: "/?x=1" });
  });

  it("o exigirPagina usa o endereço completo do middleware, se for da mesma página e da mesma origem", () => {
    assert.equal(caminhoCompleto("/suprimentos/fornecedores", ficha), ficha);
    assert.equal(caminhoCompleto("/suprimentos/fornecedores", null), "/suprimentos/fornecedores");
    assert.equal(caminhoCompleto("/suprimentos/fornecedores", "/suprimentos/compras?pedido=1"), "/suprimentos/fornecedores");
    assert.equal(caminhoCompleto("/suprimentos/fornecedores", "//evil.example/suprimentos/fornecedores"), "/suprimentos/fornecedores");
    assert.equal(caminhoCompleto("/comercial/contratos", "/comercial/contratos/abc?aba=1"), "/comercial/contratos/abc?aba=1");
  });

  it("o ?de= do aviso só aceita caminho da mesma origem", () => {
    assert.equal(destinoDoParametro(ficha), ficha);
    assert.equal(destinoDoParametro("//evil.example"), null);
    assert.equal(destinoDoParametro("javascript:alert(1)"), null);
    assert.equal(destinoDoParametro("https://evil.example/x"), null);
    assert.equal(destinoDoParametro(undefined), null);
  });

  it("o aviso reescrito volta à página pedida pelo cabeçalho do middleware, não por um ?de= que a página já tinha (PLU-357)", () => {
    // /suprimentos/fornecedores?fornecedor=…&de=/administracao, reescrita para o aviso: a query da página chega inteira.
    const pedida = `${ficha}&de=%2Fadministracao`;
    assert.equal(destinoDoAviso(pedida, "/administracao"), pedida);
    // Repetido, o ?de= chega como array: não quebra e não vale.
    assert.equal(destinoDoAviso(ficha, ["/a", "/b"]), ficha);
  });

  it("aberto direto (pelo exigirPagina), o aviso usa o ?de=, validado e só se for texto", () => {
    const direto = `/indisponivel?de=${encodeURIComponent(ficha)}`;
    assert.equal(destinoDoAviso(direto, ficha), ficha);
    assert.equal(destinoDoAviso(direto, ["/a", "/b"]), null);
    assert.equal(destinoDoAviso(direto, "//evil.example"), null);
    assert.equal(destinoDoAviso(null, ficha), ficha);
    assert.equal(destinoDoAviso(null, undefined), null);
    // Cabeçalho fora da origem não vale; cai no ?de=.
    assert.equal(destinoDoAviso("//evil.example/x", ficha), ficha);
  });

  it("ida e volta: o destino codificado no ?de= volta inteiro", () => {
    const de = new URLSearchParams(`de=${encodeURIComponent(ficha)}`).get("de");
    assert.equal(destinoAoVoltar(destinoDoParametro(de), "/indisponivel", `?de=${encodeURIComponent(ficha)}`), ficha);
  });
});
