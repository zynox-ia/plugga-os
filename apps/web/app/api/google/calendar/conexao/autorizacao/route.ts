import { proxyar } from "../../../../../lib/proxy";

/** Começa o consentimento: a API devolve o endereço do Google para onde o navegador vai. */
export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "google/calendar/conexao/autorizacao" });
}
