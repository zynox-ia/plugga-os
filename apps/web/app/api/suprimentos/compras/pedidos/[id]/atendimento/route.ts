import { proxyar } from "../../../../../../lib/proxy";

/** Quanto o estoque atende o pedido, linha a linha, na análise de estoque. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/pedidos/:id/atendimento", ids: { id } });
}
