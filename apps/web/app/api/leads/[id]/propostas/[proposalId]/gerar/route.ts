import { proxyar } from "../../../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(request: Request, { params }: Contexto) {
  const { id, proposalId } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/leads/:id/propostas/:proposalId/gerar", ids: { id, proposalId }, tempoMaximoMs: 60_000 });
}
