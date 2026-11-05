import { proxyApiMutation } from "../../../../../lib/proxy.ts";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }): Promise<Response> {
  const ids = await params;
  return proxyApiMutation(request, "PATCH", "/leads/:id/documentos/:documentId", ids);
}
