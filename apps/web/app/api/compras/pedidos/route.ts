import { proxyComprasUpload } from "../../../lib/compras-proxy";

/** Criação do pedido: multipart, porque o orçamento anexado é campo da geração. */
export async function POST(request: Request): Promise<Response> {
  return proxyComprasUpload(request, "pedidos");
}
