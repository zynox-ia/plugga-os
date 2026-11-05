import { proxyApiMutation, proxyar } from "../../../lib/proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/clientes/:id", ids: { id } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", `/clientes/:id`, { id });
}
