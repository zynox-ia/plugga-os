import { proxyar } from "../../../lib/proxy";

/**
 * O Telegram da plataforma sob a origem do web. Repassa o cookie de sessão e
 * deixa a API decidir o acesso (só desenvolvedor). O corpo do PUT carrega o
 * token do bot em claro: por isso esta rota nunca registra o corpo em log, nem em erro.
 */

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "integracoes/telegram" });
}

export async function PUT(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "PUT", modelo: "integracoes/telegram" });
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "DELETE", modelo: "integracoes/telegram" });
}
