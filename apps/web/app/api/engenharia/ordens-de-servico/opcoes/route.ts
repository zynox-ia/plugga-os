import { proxyar } from "../../../../lib/proxy";

/** Técnicos e enums dos menus (a tela lê no servidor; esta rota serve o navegador e os e2e). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/ordens-de-servico/opcoes" });
}
