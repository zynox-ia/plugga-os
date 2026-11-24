import { proxyar } from "../../../../../../../../lib/proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; cotacaoId: string }> }): Promise<Response> {
  const ids = await params;
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/pedidos/:id/cotacoes/:cotacaoId/arquivo", ids, resposta: "arquivo" });
}
