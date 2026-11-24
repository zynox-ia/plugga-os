import { proxyar } from "../../../../lib/proxy.ts";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/atividades/:id/historico", ids: await params, consulta: new URL(request.url).search });
}
