import { proxyApiMutation } from "../../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string; marcoId: string }> };

/** Marcar como feito o próximo marco da obra. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id, marcoId } = await params;
  return proxyApiMutation(request, "POST", "/engenharia/obras/:id/marcos/:marcoId/feito", { id, marcoId });
}
