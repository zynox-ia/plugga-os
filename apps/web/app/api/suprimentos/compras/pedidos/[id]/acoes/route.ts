import { proxyApiMutation } from "../../../../../../lib/proxy";

/** Uma ação da etapa por requisição; devolve o pedido atualizado. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/suprimentos/compras/pedidos/:id/acoes", { id });
}
