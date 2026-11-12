import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleCalendarHttpAdapter } from "./google-calendar-http.adapter";
import { GoogleApiError, type EventoDeAgenda } from "./google-calendar.port";

/**
 * O adaptador real, SEM rede: o `fetch` global é substituído por um dublê que
 * guarda o pedido e devolve a resposta combinada. Prova o formato do que sairia
 * para o Google (endereço, método, cabeçalhos, corpo) e o que o adaptador faz com
 * o que volta. Nenhum teste aqui alcança o Google.
 */

const APP = { clientId: "1234567890-abcdefg.apps.googleusercontent.com", clientSecret: "GOCSPX-segredo-sintetico-9z8y" };

type Pedido = { url: string; init: RequestInit };
let pedidos: Pedido[];
let respostas: (Response | Error)[];

function responder(...novas: (Response | Error)[]): void {
  respostas.push(...novas);
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const corpoDoPedido = (pedido: Pedido) => pedido.init.body;
const formulario = (pedido: Pedido) => Object.fromEntries(new URLSearchParams(String(corpoDoPedido(pedido))));
const cabecalho = (pedido: Pedido, nome: string) => new Headers(pedido.init.headers).get(nome);

/** id_token sintético: só o payload importa, porque o adaptador não valida assinatura. */
function idToken(claims: Record<string, unknown>): string {
  const codificar = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString("base64url");
  return `${codificar({ alg: "RS256" })}.${codificar(claims)}.assinatura-sintetica`;
}

const CLAIMS_VALIDAS = { iss: "https://accounts.google.com", aud: APP.clientId, email: "pessoa@exemplo.test", email_verified: true };

beforeEach(() => {
  pedidos = [];
  respostas = [];
  // Rede proibida: qualquer chamada sem resposta combinada derruba o teste em vez de sair para a internet.
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    pedidos.push({ url: String(url), init });
    const proxima = respostas.shift();
    if (!proxima) throw new Error("teste sem resposta combinada: a rede é proibida");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const adaptador = () => new GoogleCalendarHttpAdapter();

describe("trocar o código por tokens", () => {
  it("posta o formulário no endpoint de tokens, com PKCE, e lê os tokens, os escopos e a conta", async () => {
    responder(json({
      access_token: "access-do-google",
      refresh_token: "refresh-do-google",
      expires_in: 3599,
      scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events",
      token_type: "Bearer",
      id_token: idToken(CLAIMS_VALIDAS),
    }));

    const tokens = await adaptador().trocarCodigo({ ...APP, code: "codigo", codeVerifier: "verificador", redirectUri: "https://os.plugga.test/api/google/calendar/callback" });

    expect(tokens).toEqual({
      accessToken: "access-do-google",
      refreshToken: "refresh-do-google",
      expiraEmSegundos: 3599,
      escopos: ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/calendar.events"],
      email: "pessoa@exemplo.test",
    });
    const [pedido] = pedidos as [Pedido];
    expect(pedido.url).toBe("https://oauth2.googleapis.com/token");
    expect(pedido.init.method).toBe("POST");
    expect(cabecalho(pedido, "content-type")).toBe("application/x-www-form-urlencoded");
    expect(formulario(pedido)).toEqual({
      grant_type: "authorization_code",
      code: "codigo",
      code_verifier: "verificador",
      redirect_uri: "https://os.plugga.test/api/google/calendar/callback",
      client_id: APP.clientId,
      client_secret: APP.clientSecret,
    });
    // Segredo só no corpo: nunca na URL.
    expect(pedido.url).not.toContain(APP.clientSecret);
    // Redirecionamento seria levar o segredo a outro destino.
    expect(pedido.init.redirect).toBe("error");
  });

  it("não aceita e-mail de id_token de outra audiência, de outro emissor ou não verificado", async () => {
    for (const claims of [
      { ...CLAIMS_VALIDAS, aud: "outro-app.apps.googleusercontent.com" },
      { ...CLAIMS_VALIDAS, iss: "https://falso.example" },
      { ...CLAIMS_VALIDAS, email_verified: false },
      { iss: CLAIMS_VALIDAS.iss, aud: APP.clientId },
    ]) {
      responder(json({ access_token: "a", scope: "x", id_token: idToken(claims) }));
      const tokens = await adaptador().trocarCodigo({ ...APP, code: "c", codeVerifier: "v", redirectUri: "https://x.test/cb" });
      expect(tokens.email).toBeNull();
    }
  });

  it("devolve refreshToken nulo e e-mail nulo quando o Google não os manda", async () => {
    responder(json({ access_token: "a", scope: "https://www.googleapis.com/auth/calendar.events" }));

    expect(await adaptador().trocarCodigo({ ...APP, code: "c", codeVerifier: "v", redirectUri: "https://x.test/cb" })).toMatchObject({
      refreshToken: null,
      email: null,
      expiraEmSegundos: 3_600,
    });
  });

  it("código vencido vira erro com status e código curto, sem a descrição do Google", async () => {
    responder(json({ error: "invalid_grant", error_description: "Bad Request: o codigo-secreto-xyz expirou" }, 400));

    const erro = await adaptador().trocarCodigo({ ...APP, code: "codigo-secreto-xyz", codeVerifier: "v", redirectUri: "https://x.test/cb" }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(GoogleApiError);
    expect(erro).toMatchObject({ status: 400, codigo: "invalid_grant", autorizacaoPerdida: true });
    expect((erro as Error).message).toBe("google troca de código falhou (HTTP 400, invalid_grant)");
    expect((erro as Error).message).not.toContain("codigo-secreto-xyz");
  });

  it("corpo de erro hostil ou ilegível não vira código", async () => {
    responder(json({ error: "x".repeat(500) }, 400), new Response("<html>erro do proxy com refresh-do-google</html>", { status: 502 }));

    const a = await adaptador().renovarAcesso({ ...APP, refreshToken: "r" }).catch((e: unknown) => e);
    const b = await adaptador().renovarAcesso({ ...APP, refreshToken: "r" }).catch((e: unknown) => e);

    expect(a).toMatchObject({ status: 400, codigo: null });
    expect(b).toMatchObject({ status: 502, codigo: null });
    expect((b as Error).message).not.toContain("refresh-do-google");
  });

  it("resposta de sucesso sem access_token é erro", async () => {
    responder(json({ refresh_token: "r" }));

    await expect(adaptador().trocarCodigo({ ...APP, code: "c", codeVerifier: "v", redirectUri: "https://x.test/cb" })).rejects.toMatchObject({ codigo: "resposta_invalida" });
  });

  it("falha de rede e tempo esgotado viram erro sem status", async () => {
    responder(new TypeError("fetch failed"), Object.assign(new Error("tempo"), { name: "TimeoutError" }));

    await expect(adaptador().renovarAcesso({ ...APP, refreshToken: "r" })).rejects.toMatchObject({ status: null, codigo: "rede" });
    await expect(adaptador().renovarAcesso({ ...APP, refreshToken: "r" })).rejects.toMatchObject({ status: null, codigo: "timeout" });
  });
});

describe("renovar o acesso", () => {
  it("posta o refresh_token no endpoint de tokens e devolve o novo access token", async () => {
    responder(json({ access_token: "novo-access", expires_in: 3599, token_type: "Bearer" }));

    expect(await adaptador().renovarAcesso({ ...APP, refreshToken: "refresh-do-google" })).toEqual({ accessToken: "novo-access", expiraEmSegundos: 3599 });

    const [pedido] = pedidos as [Pedido];
    expect(pedido.url).toBe("https://oauth2.googleapis.com/token");
    expect(formulario(pedido)).toEqual({ grant_type: "refresh_token", refresh_token: "refresh-do-google", client_id: APP.clientId, client_secret: APP.clientSecret });
  });

  it("token revogado pela pessoa no Google vira autorizacaoPerdida", async () => {
    responder(json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));

    await expect(adaptador().renovarAcesso({ ...APP, refreshToken: "r" })).rejects.toMatchObject({ autorizacaoPerdida: true });
  });
});

describe("revogar", () => {
  it("posta o token no endpoint de revogação", async () => {
    responder(new Response(null, { status: 200 }));

    await adaptador().revogar("refresh-do-google");

    const [pedido] = pedidos as [Pedido];
    expect(pedido.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(pedido.init.method).toBe("POST");
    expect(formulario(pedido)).toEqual({ token: "refresh-do-google" });
    expect(pedido.url).not.toContain("refresh-do-google");
  });

  it("revogar o que já foi revogado não é erro", async () => {
    responder(json({ error: "invalid_token", error_description: "Token expired or revoked" }, 400));

    await expect(adaptador().revogar("antigo")).resolves.toBeUndefined();
  });

  it("outras falhas continuam sendo erro", async () => {
    responder(json({ error: "backendError" }, 503));

    await expect(adaptador().revogar("t")).rejects.toMatchObject({ status: 503 });
  });
});

describe("eventos da agenda", () => {
  const evento: EventoDeAgenda = {
    id: "atividade0001a2b3c",
    titulo: "Ligar para o cliente",
    descricao: "Confirmar a visita",
    local: "Manaus",
    inicio: new Date("2026-11-16T13:00:00.000Z"),
    fim: new Date("2026-11-16T14:00:00.000Z"),
    fusoHorario: "America/Manaus",
    propriedadesPrivadas: { atividade: "00000000-0000-4000-8000-000000000001" },
  };

  it("cria na agenda principal com o access token no cabeçalho e o id estável no corpo", async () => {
    responder(json({ id: "atividade0001a2b3c", htmlLink: "https://www.google.com/calendar/event?eid=abc" }));

    const criado = await adaptador().criarEvento("access-do-google", evento);

    expect(criado).toEqual({ id: "atividade0001a2b3c", link: "https://www.google.com/calendar/event?eid=abc" });
    const [pedido] = pedidos as [Pedido];
    expect(pedido.url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(pedido.init.method).toBe("POST");
    expect(cabecalho(pedido, "authorization")).toBe("Bearer access-do-google");
    expect(JSON.parse(String(corpoDoPedido(pedido)))).toEqual({
      id: "atividade0001a2b3c",
      summary: "Ligar para o cliente",
      description: "Confirmar a visita",
      location: "Manaus",
      start: { dateTime: "2026-11-16T13:00:00.000Z", timeZone: "America/Manaus" },
      end: { dateTime: "2026-11-16T14:00:00.000Z", timeZone: "America/Manaus" },
      extendedProperties: { private: { atividade: "00000000-0000-4000-8000-000000000001" } },
    });
    // O token vai no cabeçalho, nunca na URL.
    expect(pedido.url).not.toContain("access-do-google");
  });

  it("escapa agenda e id no caminho", async () => {
    responder(json({ id: "x" }));

    await adaptador().criarEvento("a", { ...evento, id: undefined }, "outra agenda@group.calendar.google.com");

    expect((pedidos[0] as Pedido).url).toBe("https://www.googleapis.com/calendar/v3/calendars/outra%20agenda%40group.calendar.google.com/events");
    expect(JSON.parse(String((pedidos[0] as Pedido).init.body))).not.toHaveProperty("id");
  });

  it("atualiza com PATCH, sem reenviar o id, para não apagar o que a pessoa acrescentou no Google", async () => {
    responder(json({ id: "atividade0001a2b3c" }));

    const atualizado = await adaptador().atualizarEvento("access-do-google", "atividade0001a2b3c", evento);

    expect(atualizado).toEqual({ id: "atividade0001a2b3c", link: null });
    const [pedido] = pedidos as [Pedido];
    expect(pedido.url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/atividade0001a2b3c");
    expect(pedido.init.method).toBe("PATCH");
    expect(JSON.parse(String(corpoDoPedido(pedido)))).not.toHaveProperty("id");
  });

  it("remove com DELETE e trata evento inexistente como removido", async () => {
    responder(new Response(null, { status: 204 }), json({ error: { code: 410, status: "gone", message: "Resource has been deleted" } }, 410), json({ error: { code: 404, status: "NOT_FOUND" } }, 404));

    await adaptador().removerEvento("access-do-google", "atividade0001a2b3c");
    await expect(adaptador().removerEvento("access-do-google", "ja-removido")).resolves.toBeUndefined();
    await expect(adaptador().removerEvento("access-do-google", "nunca-existiu")).resolves.toBeUndefined();

    expect((pedidos[0] as Pedido).init.method).toBe("DELETE");
    expect((pedidos[0] as Pedido).url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/atividade0001a2b3c");
  });

  it("outras falhas na agenda continuam sendo erro, com o código curto do Google", async () => {
    responder(json({ error: { code: 403, status: "PERMISSION_DENIED", message: "texto longo com dados da pessoa" } }, 403), json({ error: { code: 409, errors: [{ reason: "duplicate" }] } }, 409));

    const a = await adaptador().removerEvento("a", "id1").catch((e: unknown) => e);
    const b = await adaptador().criarEvento("a", evento).catch((e: unknown) => e);

    expect(a).toMatchObject({ status: 403, codigo: "PERMISSION_DENIED" });
    expect(b).toMatchObject({ status: 409, codigo: "duplicate" });
    expect((a as Error).message).not.toContain("dados da pessoa");
  });
});
