import { proxyar } from "../../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string; projectId: string }> };

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id, projectId } = await params;
  return proxyar(request, { metodo: "PATCH", modelo: "/leads/:id/projetos-solares/:projectId", ids: { id, projectId } });
}
