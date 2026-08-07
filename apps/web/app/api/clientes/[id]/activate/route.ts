import { proxyApiMutation } from "../../../../lib/api-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", `/clientes/${id}/activate`);
}
