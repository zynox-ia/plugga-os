import { proxyar } from "../../../../lib/proxy";

/** Busca de cliente para o destino do pedido (só id e nome). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/clientes", consulta: new URL(request.url).search });
}
