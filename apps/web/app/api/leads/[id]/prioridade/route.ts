import { proxyApiMutation } from "../../../../lib/proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/leads/:id/prioridade", { id });
}
