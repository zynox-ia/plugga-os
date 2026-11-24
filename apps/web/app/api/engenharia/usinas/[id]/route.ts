import { proxyApiMutation, proxyar } from "../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** A ficha da usina e a edição. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/usinas/:id", ids: { id } });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/engenharia/usinas/:id", { id });
}
