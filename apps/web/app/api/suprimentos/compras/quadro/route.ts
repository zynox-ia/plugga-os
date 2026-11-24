import { proxyar } from "../../../../lib/proxy";

/** Quadro de compras por etapa, com filtros de empresa, responsável, destino e período. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/quadro", consulta: new URL(request.url).search });
}
