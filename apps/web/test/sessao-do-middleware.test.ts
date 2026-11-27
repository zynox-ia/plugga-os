import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sessionUserSchema } from "@plugga/shared";

import { TEMPO_MAXIMO_MS } from "../app/lib/api-core.ts";
import { PRAZO_DA_SESSAO_MS, PRAZO_DA_TENTATIVA_MS, prazoDaTentativa } from "../app/lib/sessao-do-middleware.ts";
import { caminhoCompleto, consultarSessaoParaVoltar, decidirPagina, destinoAoVoltar, destinoDoAviso, destinoDoParametro, lerSessaoDaApi, passoDoTentarDeNovo, type LeituraDaSessao } from "../app/lib/sessao-do-middleware.ts";

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

describe("passoDoTentarDeNovo: o retry do aviso usa o mesmo contrato do middleware (PLU-343)", () => {
  it("200 com o contrato volta; 401/403 vão ao login", async () => {
    assert.equal(await passoDoTentarDeNovo(Response.json(USUARIO)), "voltar");
    assert.equal(await passoDoTentarDeNovo(new Response(null, { status: 401 })), "login");
    assert.equal(await passoDoTentarDeNovo(new Response(null, { status: 403 })), "login");
  });

  it("200 fora do contrato espera, em vez de recarregar e cair no aviso de novo em laço", async () => {
    assert.equal(await passoDoTentarDeNovo(Response.json({ qualquer: "coisa" })), "esperar");
    assert.equal(await passoDoTentarDeNovo(new Response("<html>", { status: 200 })), "esperar");
    assert.equal(await passoDoTentarDeNovo(new Response(null, { status: 204 })), "esperar");
  });

  it("503 e outras recusas esperam", async () => {
    for (const status of [503, 500, 502, 429, 404]) assert.equal(await passoDoTentarDeNovo(new Response(null, { status })), "esperar", String(status));
  });
});

describe("consultarSessaoParaVoltar: o retry tem prazo e retoma (PLU-343)", () => {
  /** Um fetch que só termina quando o sinal aborta, como uma conexão com a web que parou. */
  const parado = (async (_url: string, init?: RequestInit) => new Promise<Response>((_, rejeitar) => {
    init?.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
  })) as unknown as typeof fetch;

  it("a conexão parada não congela a tentativa: o prazo aborta e o passo é esperar", async () => {
    const inicio = Date.now();
    assert.equal(await consultarSessaoParaVoltar(parado, 20), "esperar");
    assert.ok(Date.now() - inicio < 2_000);
  });

  it("depois do prazo, a próxima tentativa retoma e volta à página quando a sessão responde", async () => {
    assert.equal(await consultarSessaoParaVoltar(parado, 20), "esperar");
    let pedido: { url: string; init?: RequestInit } | undefined;
    const responde = (async (url: string, init?: RequestInit) => { pedido = { url, init }; return Response.json(USUARIO); }) as unknown as typeof fetch;
    assert.equal(await consultarSessaoParaVoltar(responde, 20), "voltar");
    assert.equal(pedido?.url, "/api/auth/me");
    assert.equal(pedido?.init?.cache, "no-store");
    assert.ok(pedido?.init?.signal instanceof AbortSignal);
  });

  it("o corpo que para no meio também respeita o prazo", async () => {
    const corpoParado = (async (_url: string, init?: RequestInit) => new Response(new ReadableStream({
      start(controle) { init?.signal?.addEventListener("abort", () => controle.error(init.signal?.reason)); },
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    assert.equal(await consultarSessaoParaVoltar(corpoParado, 20), "esperar");
  });

  it("o prazo do cliente vem do prazo do proxy e do middleware, com folga: nunca desiste antes deles", () => {
    assert.equal(PRAZO_DA_SESSAO_MS, TEMPO_MAXIMO_MS);
    assert.equal(PRAZO_DA_TENTATIVA_MS, prazoDaTentativa(TEMPO_MAXIMO_MS));
    assert.ok(PRAZO_DA_TENTATIVA_MS > TEMPO_MAXIMO_MS);
  });

  it("em escala: a sessão que responde logo antes do prazo do proxy faz voltar; a que nunca chega espera", async () => {
    const proxy = 60;
    const cliente = prazoDaTentativa(proxy);
    const demora = (ms: number) => (async (_url: string, init?: RequestInit) => new Promise<Response>((resolver, rejeitar) => {
      const relogio = setTimeout(() => resolver(Response.json(USUARIO)), ms);
      init?.signal?.addEventListener("abort", () => { clearTimeout(relogio); rejeitar(init.signal?.reason); });
    })) as unknown as typeof fetch;
    // Como a sessão entre 11 e 14 s com o proxy de 15 s: o cliente não pode desistir antes.
    assert.equal(await consultarSessaoParaVoltar(demora(proxy - 1), cliente), "voltar");
    assert.equal(await consultarSessaoParaVoltar(parado, cliente), "esperar");
  });

  it("sem rede até a web, espera; 401 vai ao login", async () => {
    assert.equal(await consultarSessaoParaVoltar((async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch, 20), "esperar");
    assert.equal(await consultarSessaoParaVoltar((async () => new Response(null, { status: 401 })) as unknown as typeof fetch, 20), "login");
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
    assert.equal(destinoDoAviso(null, undefined), null);
  });

  it("sem a evidência de abertura direta (o cabeçalho do middleware no próprio aviso), o ?de= não vale (PLU-357)", () => {
    assert.equal(destinoDoAviso(null, ficha), null);
    assert.equal(destinoDoAviso("//evil.example/x", ficha), null);
    assert.equal(destinoDoAviso("/indisponivelx?de=1", ficha), "/indisponivelx?de=1");
  });

  it("o fallback pela janela também passa pela validação de destino (PLU-357)", () => {
    // O endereço da janela, normalizado, não pode sair da origem.
    assert.equal(destinoAoVoltar(null, "/.//evil.example", ""), "/");
    assert.equal(destinoAoVoltar(null, "/x/..//evil.example", "?a=1"), "/");
    assert.equal(destinoAoVoltar(null, "/suprimentos/estoque", "?visao=lista"), "/suprimentos/estoque?visao=lista");
  });

  it("ida e volta: o destino codificado no ?de= volta inteiro", () => {
    const de = new URLSearchParams(`de=${encodeURIComponent(ficha)}`).get("de");
    assert.equal(destinoAoVoltar(destinoDoParametro(de), "/indisponivel", `?de=${encodeURIComponent(ficha)}`), ficha);
  });
});
