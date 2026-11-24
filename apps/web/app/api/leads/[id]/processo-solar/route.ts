import { proxyar } from "../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/leads/:id/processo-solar", ids: { id } });
}
