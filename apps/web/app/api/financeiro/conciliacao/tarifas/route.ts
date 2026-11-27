import { proxyApiMutation } from "../../../../lib/proxy";

/** Cria as tarifas de várias linhas sem par e concilia cada uma que der certo. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/tarifas");
}
