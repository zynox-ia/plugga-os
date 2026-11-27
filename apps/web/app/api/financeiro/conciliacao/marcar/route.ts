import { proxyApiMutation } from "../../../../lib/proxy";

/** Marca como pendente, ou retoma, uma linha do extrato ou um lançamento. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/marcar");
}
