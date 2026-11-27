import { proxyApiMutation } from "../../../../lib/proxy";

/** Concilia os pares sugeridos do período, sempre com o mesmo valor. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/conciliar-sugeridos");
}
