import { proxyar } from "../../../lib/proxy";

/** Busca de clientes para a cobrança (2+ letras): só id, nome e as UCs; o Financeiro não lê o CRM inteiro. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/clientes", consulta: new URL(request.url).search });
}
