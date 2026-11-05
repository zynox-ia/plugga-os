import { proxyApiMutation } from "../../../../../../lib/proxy.ts";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }): Promise<Response> {
  const ids = await params;
  return proxyApiMutation(request, "POST", "/leads/:id/documentos/:documentId/arquivar", ids);
}
