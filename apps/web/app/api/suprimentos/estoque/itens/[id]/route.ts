import { proxyApiMutation, proxyar } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/estoque/itens/:id", ids: { id } });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/suprimentos/estoque/itens/:id", { id });
}
