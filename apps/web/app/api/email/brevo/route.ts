import { proxyar } from "../../../lib/proxy";

/**
 * O Brevo da empresa sob a origem do web.
 *
 * Repassa o cookie de sessão e deixa a API decidir o acesso. O corpo do PUT
 * carrega a chave em claro: por isso esta rota nunca registra o corpo em log,
 * nem em erro. A API é quem recusa mutação sem `Origin` válido.
 */

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "email/brevo" });
}

export async function PUT(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "PUT", modelo: "email/brevo" });
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "DELETE", modelo: "email/brevo" });
}
