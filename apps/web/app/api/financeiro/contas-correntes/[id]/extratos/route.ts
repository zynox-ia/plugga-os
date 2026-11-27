import { proxyar } from "../../../../../lib/proxy";

/** Importa o extrato OFX da conta (multipart: `arquivo`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/financeiro/contas-correntes/:id/extratos", ids: { id }, corpo: "multipart" });
}
