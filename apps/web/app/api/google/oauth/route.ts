import { proxyar } from "../../../lib/proxy";

/**
 * As credenciais do app OAuth do Google sob a origem do web.
 *
 * Repassa o cookie de sessão e deixa a API decidir o acesso (só desenvolvedor).
 * O corpo do PUT carrega o client secret em claro: por isso esta rota nunca
 * registra o corpo em log, nem em erro. A API é quem recusa mutação sem `Origin`
 * válido.
 */

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "google/oauth" });
}

export async function PUT(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "PUT", modelo: "google/oauth" });
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "DELETE", modelo: "google/oauth" });
}
