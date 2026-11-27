import { proxyApiMutation } from "../../../../lib/proxy";

/** Cria a tarifa bancária de uma linha sem par e a concilia. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/tarifa");
}
