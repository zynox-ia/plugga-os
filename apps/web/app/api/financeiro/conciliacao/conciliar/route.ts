import { proxyApiMutation } from "../../../../lib/proxy";

/** Concilia uma linha do extrato com um lançamento do mesmo valor. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/conciliar");
}
