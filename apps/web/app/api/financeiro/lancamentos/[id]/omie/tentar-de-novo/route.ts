import { proxyApiMutation } from "../../../../../../lib/proxy";

/** Devolve à fila do OMIE os envios com erro do lançamento (PLU-342); 409 se não há nenhum. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/financeiro/lancamentos/:id/omie/tentar-de-novo", { id });
}
