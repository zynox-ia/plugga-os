import { proxyApiMutation } from "../../../lib/api-proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", `/clientes/${id}`);
}
