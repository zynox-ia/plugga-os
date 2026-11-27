import { proxyar } from "../../../../../lib/proxy.ts";

/** Os lançamentos liquidados que somam uma linha do relatório por categoria (PLU-360). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/relatorios/categorias/lancamentos", consulta: new URL(request.url).search });
}
