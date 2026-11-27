import { proxyApiMutation } from "../../../lib/proxy.ts";

/** Nova categoria do plano de contas (só a gerência do Financeiro; a API confere). */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/categorias");
}
