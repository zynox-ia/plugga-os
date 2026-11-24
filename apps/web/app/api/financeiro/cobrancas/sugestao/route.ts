import { proxyar } from "../../../../lib/proxy";

/** O valor da cobrança do mesmo cliente e empresa na competência anterior mais recente (F4). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/cobrancas/sugestao", consulta: new URL(request.url).search });
}
