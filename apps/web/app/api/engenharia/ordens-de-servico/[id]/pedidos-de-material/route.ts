import { proxyApiMutation } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Pedir material: cria o pedido de compra em Suprimentos com a origem na O.S. (PLU-327). */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/engenharia/ordens-de-servico/:id/pedidos-de-material", { id });
}
