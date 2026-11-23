import { proxyApiMutation } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Ações do ciclo: agendar, check-in, laudo, adiar e cancelar. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/engenharia/ordens-de-servico/:id/acoes", { id });
}
