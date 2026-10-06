import { proxyar } from "../../../lib/proxy";

/**
 * A chave da OpenRouter sob a origem do web.
 *
 * Repassa o cookie de sessão e deixa a API decidir o acesso — o web não julga
 * permissão por conta própria. O `Origin` do navegador vai junto: a API recusa
 * mutação com cookie e sem `Origin` (US11, T119). A checagem de origem e o
 * repasse de `X-Forwarded-For` vêm do proxy genérico (US12, T124), que
 * substituiu a cópia local de `isOriginAllowed` que existia aqui.
 *
 * O corpo do PUT carrega a chave em claro. Isso é aceitável porque a ligação é
 * TLS até o Caddy e loopback dali para dentro — mas é o motivo de esta rota
 * nunca registrar o corpo em log, nem em erro.
 */

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "llm/chave" });
}

export async function PUT(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "PUT", modelo: "llm/chave" });
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "DELETE", modelo: "llm/chave" });
}
