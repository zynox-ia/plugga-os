import { proxyApiMutation } from "../../../lib/proxy";

/** Nova cobrança manual (PLU-337): uma por cliente, empresa e competência; a repetida é 409 com o código da existente. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/cobrancas");
}
