import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { handleGoogleCalendarCallback, origemDoApp } from "../app/lib/google-calendar-callback.ts";
import { MENSAGEM_DO_RESULTADO, RESULTADOS_DA_CONEXAO, resultadoDaUrl } from "../app/lib/google-calendar-resultado.ts";

interface Registrado {
  url: string;
  init: RequestInit;
}

/** Substitui só o `fetch` para a API; o resto do caminho é o código real. Nada sai para a rede. */
function api(resposta: Response | Error, registrado: Registrado[] = []): typeof fetch {
  return (async (url: string | URL | Request, init: RequestInit = {}) => {
    registrado.push({ url: String(url), init });
    if (resposta instanceof Error) throw resposta;
    return resposta;
  }) as unknown as typeof fetch;
}

function retorno(consulta: string, cabecalhos: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000/api/google/calendar/callback?${consulta}`, {
    headers: { cookie: "plugga_session=s.assinada", ...cabecalhos },
  });
}

const COM_CODIGO = "code=codigo-do-google&state=state-selado";

afterEach(() => {
  delete process.env.AUTH_ALLOWED_ORIGINS;
});

describe("retorno do consentimento do Google", () => {
  it("repassa code e state à API com a sessão da pessoa e volta à aba de integrações", async () => {
    const registrado: Registrado[] = [];

    const resposta = await handleGoogleCalendarCallback(retorno(COM_CODIGO), { fetchImpl: api(Response.json({ conectado: true }), registrado) });

    assert.equal(resposta.status, 303);
    assert.equal(resposta.headers.get("location"), "/configuracoes?aba=integracoes&google=conectado");
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    const chamada = registrado[0]!;
    assert.match(chamada.url, /\/google\/calendar\/conexao\/retorno$/);
    assert.equal(chamada.init.method, "POST");
    assert.deepEqual(JSON.parse(String(chamada.init.body)), { code: "codigo-do-google", state: "state-selado" });
    const cabecalhos = chamada.init.headers as Record<string, string>;
    assert.equal(cabecalhos.cookie, "plugga_session=s.assinada");
    assert.equal(cabecalhos.origin, "http://localhost:3000");
    // O código segue no corpo, nunca na URL da API.
    assert.ok(!chamada.url.includes("codigo-do-google"));
  });

  it("a resposta nunca devolve code ou state na URL de volta", async () => {
    const resposta = await handleGoogleCalendarCallback(retorno(COM_CODIGO), { fetchImpl: api(Response.json({}, { status: 400 })) });

    const destino = resposta.headers.get("location") ?? "";
    assert.ok(!destino.includes("codigo-do-google") && !destino.includes("state-selado"), destino);
  });

  it("usa a origem configurada quando AUTH_ALLOWED_ORIGINS está definida", async () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://os.plugga.test, https://outra.plugga.test";
    const registrado: Registrado[] = [];

    await handleGoogleCalendarCallback(retorno(COM_CODIGO), { fetchImpl: api(Response.json({}), registrado) });

    assert.equal((registrado[0]!.init.headers as Record<string, string>).origin, "https://os.plugga.test");
  });

  it("sem origem confiável (host de fora, sem configuração), não inventa uma: a API é quem recusa", () => {
    assert.equal(origemDoApp(new Request("https://qualquer.site/api/google/calendar/callback")), null);
    assert.equal(origemDoApp(new Request("http://127.0.0.1:3000/x")), "http://127.0.0.1:3000");
  });

  it("pessoa que negou o acesso volta com `negado`, sem chamar a API", async () => {
    const registrado: Registrado[] = [];

    const resposta = await handleGoogleCalendarCallback(retorno("error=access_denied&state=x"), { fetchImpl: api(Response.json({}), registrado) });

    assert.equal(resposta.headers.get("location"), "/configuracoes?aba=integracoes&google=negado");
    assert.equal(registrado.length, 0);
  });

  it("outro erro do Google volta como `erro`, sem repetir o texto que o Google mandou", async () => {
    const resposta = await handleGoogleCalendarCallback(retorno("error=%3Cscript%3E&error_description=texto+forjado"), { fetchImpl: api(Response.json({})) });

    assert.equal(resposta.headers.get("location"), "/configuracoes?aba=integracoes&google=erro");
  });

  it("retorno sem code ou sem state, ou grande demais, não chega à API", async () => {
    const registrado: Registrado[] = [];
    const fetchImpl = api(Response.json({}), registrado);

    for (const consulta of ["state=s", "code=c", "", `code=${"x".repeat(2049)}&state=s`, `code=c&state=${"y".repeat(4097)}`]) {
      const resposta = await handleGoogleCalendarCallback(retorno(consulta), { fetchImpl });
      assert.equal(resposta.headers.get("location"), "/configuracoes?aba=integracoes&google=invalido", consulta.slice(0, 20));
    }
    assert.equal(registrado.length, 0);
  });

  it("traduz o status da API em um resultado fechado", async () => {
    const esperado: [Response | Error, string][] = [
      [Response.json({}, { status: 400 }), "invalido"],
      [Response.json({}, { status: 409 }), "indisponivel"],
      [Response.json({}, { status: 429 }), "indisponivel"],
      [Response.json({}, { status: 503 }), "indisponivel"],
      [Response.json({}, { status: 403 }), "erro"],
      [Response.json({}, { status: 500 }), "erro"],
      [new TypeError("fetch failed"), "indisponivel"],
    ];
    for (const [resposta, resultado] of esperado) {
      const volta = await handleGoogleCalendarCallback(retorno(COM_CODIGO), { fetchImpl: api(resposta) });
      assert.equal(volta.headers.get("location"), `/configuracoes?aba=integracoes&google=${resultado}`);
    }
  });

  it("sem sessão (401), leva a pessoa para entrar", async () => {
    const resposta = await handleGoogleCalendarCallback(retorno(COM_CODIGO), { fetchImpl: api(Response.json({}, { status: 401 })) });

    assert.equal(resposta.headers.get("location"), "/login");
  });
});

describe("resultado na URL", () => {
  it("só aceita os códigos da lista fechada, e cada um tem mensagem", () => {
    for (const resultado of RESULTADOS_DA_CONEXAO) {
      assert.equal(resultadoDaUrl(resultado), resultado);
      assert.ok(MENSAGEM_DO_RESULTADO[resultado].texto.length > 10);
    }
    for (const invalido of [null, "", "sucesso", "<script>", "CONECTADO", "conectado "]) {
      assert.equal(resultadoDaUrl(invalido), null, String(invalido));
    }
  });
});
