import { proxyApiMutation } from "../../../../lib/proxy";

/** Obra mínima criada na hora, como destino do pedido. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/suprimentos/compras/obras");
}
