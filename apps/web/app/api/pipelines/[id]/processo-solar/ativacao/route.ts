import { proxyar } from "../../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/pipelines/:id/processo-solar/ativacao", ids: { id } });
}
