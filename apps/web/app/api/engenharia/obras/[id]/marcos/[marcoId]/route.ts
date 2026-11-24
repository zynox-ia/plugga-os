import { proxyApiMutation } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string; marcoId: string }> };

/** Reprogramar um marco pendente: a nova data prevista, dentro do período da obra e não no passado. */
export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id, marcoId } = await params;
  return proxyApiMutation(request, "PATCH", "/engenharia/obras/:id/marcos/:marcoId", { id, marcoId });
}
