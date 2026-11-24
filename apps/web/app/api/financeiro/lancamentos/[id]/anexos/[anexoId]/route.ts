import { proxyar } from "../../../../../../lib/proxy";

/** Baixa um anexo do lançamento, atual ou substituído. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; anexoId: string }> }): Promise<Response> {
  const { id, anexoId } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/lancamentos/:id/anexos/:anexoId", ids: { id, anexoId }, resposta: "arquivo" });
}
