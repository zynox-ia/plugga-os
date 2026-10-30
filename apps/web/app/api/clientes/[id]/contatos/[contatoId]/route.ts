import { proxyApiMutation, proxyar } from "../../../../../lib/proxy";

type Parametros = { params: Promise<{ id: string; contatoId: string }> };

export async function PATCH(request: Request, { params }: Parametros): Promise<Response> {
  const { id, contatoId } = await params;
  return proxyApiMutation(request, "PATCH", "/clientes/:id/contatos/:contatoId", { id, contatoId });
}

export async function DELETE(request: Request, { params }: Parametros): Promise<Response> {
  const { id, contatoId } = await params;
  return proxyar(request, { metodo: "DELETE", modelo: "/clientes/:id/contatos/:contatoId", ids: { id, contatoId } });
}
