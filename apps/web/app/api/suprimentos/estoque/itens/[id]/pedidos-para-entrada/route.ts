import { proxyar } from "../../../../../../lib/proxy";

/** Pedidos que ainda aceitam entrada do item (origem "Compra"), pela tela de Estoque. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/estoque/itens/:id/pedidos-para-entrada", ids: { id } });
}
