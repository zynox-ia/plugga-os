import { proxyApiMutation } from "../../../lib/proxy.ts";

/** Nova conta corrente da empresa (só a gerência do Financeiro; a API confere). */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/contas-correntes");
}
