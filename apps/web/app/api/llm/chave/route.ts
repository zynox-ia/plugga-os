import { apiBaseUrl } from "../../../lib/env";
import { clientForwardedFor } from "../../../lib/forwarded-for";

/**
 * A chave da OpenRouter sob a origem do web.
 *
 * Repassa o cookie de sessão e deixa a API decidir o acesso — o web não julga
 * permissão por conta própria. O `origin` vai junto porque as rotas que gravam
 * exigem `OriginCheckGuard`: sem ele, a troca de credencial seria recusada.
 *
 * O corpo do PUT carrega a chave em claro. Isso é aceitável porque a ligação é
 * TLS até o Caddy e loopback dali para dentro — mas é o motivo de esta rota
 * nunca registrar o corpo em log, nem em erro.
 */
function cabecalhos(request: Request): HeadersInit {
  const cookie = request.headers.get("cookie");
  const encaminhado = clientForwardedFor(request);
  return {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    origin: new URL(request.url).origin,
    ...(encaminhado ? { "x-forwarded-for": encaminhado } : {}),
  };
}

async function repassar(resposta: Response): Promise<Response> {
  const corpo = await resposta.text();
  return new Response(corpo, {
    status: resposta.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(request: Request): Promise<Response> {
  return repassar(
    await fetch(`${apiBaseUrl()}/llm/chave`, {
      headers: cabecalhos(request),
      cache: "no-store",
    }),
  );
}

export async function PUT(request: Request): Promise<Response> {
  return repassar(
    await fetch(`${apiBaseUrl()}/llm/chave`, {
      method: "PUT",
      headers: cabecalhos(request),
      body: await request.text(),
      cache: "no-store",
    }),
  );
}

export async function DELETE(request: Request): Promise<Response> {
  return repassar(
    await fetch(`${apiBaseUrl()}/llm/chave`, {
      method: "DELETE",
      headers: cabecalhos(request),
      cache: "no-store",
    }),
  );
}
