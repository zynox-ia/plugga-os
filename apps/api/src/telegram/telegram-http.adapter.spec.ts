import { afterEach, describe, expect, it, vi } from "vitest";

import { TelegramHttpAdapter } from "./telegram-http.adapter";
import { TelegramFalhouError } from "./telegram.port";

const TOKEN = "123456789:AAH-segredo_do_bot_para_teste_0000000";

function responder(status: number, corpo = "{}") {
  const mock = vi.fn<typeof fetch>(async () => new Response(corpo, { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function motivoDaFalha(promessa: Promise<void>): Promise<string> {
  const erro = await promessa.then(() => null, (e: unknown) => e);
  expect(erro).toBeInstanceOf(TelegramFalhouError);
  return (erro as TelegramFalhouError).motivo;
}

describe("TelegramHttpAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envia HTML para o chat pela Bot API", async () => {
    const chamada = responder(200);

    await new TelegramHttpAdapter().enviar(TOKEN, "-1001234567890", "<b>oi</b>");

    const [url, init] = chamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "-1001234567890", text: "<b>oi</b>", parse_mode: "HTML", disable_web_page_preview: true });
  });

  it("traduz cada recusa do Telegram em um motivo curto", async () => {
    const casos: [number, string][] = [[401, "token_invalido"], [404, "token_invalido"], [400, "chat_invalido"], [403, "bot_sem_permissao"], [429, "limite_de_envio"], [500, "indisponivel"]];
    for (const [status, motivo] of casos) {
      responder(status);
      expect(await motivoDaFalha(new TelegramHttpAdapter().enviar(TOKEN, "-100123456", "x"))).toBe(motivo);
    }
  });

  it("rede caída ou prazo estourado viram indisponível", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await motivoDaFalha(new TelegramHttpAdapter().enviar(TOKEN, "-100123456", "x"))).toBe("indisponivel");
  });

  it("o erro nunca carrega o token, a URL nem o corpo da resposta", async () => {
    responder(401, JSON.stringify({ description: `Unauthorized ${TOKEN}` }));
    const erro = (await new TelegramHttpAdapter().enviar(TOKEN, "-100123456", "x").then(() => null, (e: unknown) => e)) as Error;

    expect(`${erro.message} ${erro.stack ?? ""}`).not.toContain(TOKEN);
    expect(erro.message).not.toContain("api.telegram.org");
  });
});
