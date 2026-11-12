import { proxyar } from "../../../../lib/proxy";

/**
 * A conexão da agenda do Google da própria pessoa sob a origem do web.
 *
 * Repassa o cookie de sessão e deixa a API decidir; a API só entrega e altera a
 * conexão de quem está na sessão. Nenhuma resposta carrega token.
 */

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "google/calendar/conexao" });
}

export async function DELETE(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "DELETE", modelo: "google/calendar/conexao" });
}
