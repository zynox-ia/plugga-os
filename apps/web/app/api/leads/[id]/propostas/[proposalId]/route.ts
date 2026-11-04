import { proxyar } from "../../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string; proposalId: string }> };

export async function PATCH(request: Request, { params }: Contexto) {
  const { id, proposalId } = await params;
  return proxyar(request, { metodo: "PATCH", modelo: "/leads/:id/propostas/:proposalId", ids: { id, proposalId }, tempoMaximoMs: 60_000 });
}
