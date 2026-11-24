import { proxyar } from "../../../../../lib/proxy";

/** Anexa um arquivo ao lançamento (multipart: `arquivo` e `tipo`); devolve o lançamento atualizado. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/financeiro/lancamentos/:id/anexos", ids: { id }, corpo: "multipart" });
}
