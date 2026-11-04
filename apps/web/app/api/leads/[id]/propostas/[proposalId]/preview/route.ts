import { proxyar } from "../../../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string; proposalId: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const { id, proposalId } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/leads/:id/propostas/:proposalId/preview", ids: { id, proposalId }, resposta: "arquivo" });
}
