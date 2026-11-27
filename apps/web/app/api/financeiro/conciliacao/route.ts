import { proxyar } from "../../../lib/proxy";

/** Painel da conciliação: sugeridos, divergências, sem par e conciliados (PLU-339). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/conciliacao", consulta: new URL(request.url).search });
}
