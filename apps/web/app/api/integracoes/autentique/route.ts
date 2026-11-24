import { proxyar } from "../../../lib/proxy";

/** O estado das contas da Autentique (uma por empresa) sob a origem do web. A API decide o acesso (só desenvolvedor). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "integracoes/autentique" });
}
