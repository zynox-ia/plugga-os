import { proxyApiMutation, proxyar } from "../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** A ficha do protocolo, com o histórico, e a edição. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/protocolos/:id", ids: { id } });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/protocolos/:id", { id });
}
