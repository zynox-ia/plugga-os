import { proxyApiMutation, proxyar } from "../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** A ficha do lançamento e a edição antes de pagar (PLU-336). */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/lancamentos/:id", ids: { id } });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/financeiro/lancamentos/:id", { id });
}
