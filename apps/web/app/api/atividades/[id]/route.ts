import { proxyar, proxyApiMutation } from "../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/atividades/:id", ids: await params });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  return proxyApiMutation(request, "PATCH", "/atividades/:id", await params);
}
