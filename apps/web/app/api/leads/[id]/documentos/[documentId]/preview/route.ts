import { proxyar } from "../../../../../../lib/proxy.ts";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }): Promise<Response> {
  const ids = await params;
  return proxyar(request, { metodo: "GET", modelo: "/leads/:id/documentos/:documentId/preview", ids, resposta: "arquivo" });
}
