import { proxyApiMutation, proxyar } from "../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** A ficha, para reler depois de um conflito. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/ordens-de-servico/:id", ids: { id } });
}

/** Editar dados e equipamento (antes de concluída ou cancelada). */
export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/engenharia/ordens-de-servico/:id", { id });
}
