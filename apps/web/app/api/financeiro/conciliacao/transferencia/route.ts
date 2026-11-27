import { proxyApiMutation } from "../../../../lib/proxy";

/** A transferência entre contas da mesma empresa a partir de uma linha sem par; a perna da linha fica conciliada. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/transferencia");
}
