import { proxyApiMutation } from "../../../../../lib/proxy";

/** Uma ação da etapa por requisição (aprovar, cancelar…); devolve o lançamento atualizado. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/financeiro/lancamentos/:id/acoes", { id });
}
