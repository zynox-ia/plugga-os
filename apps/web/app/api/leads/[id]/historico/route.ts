import { proxyar } from "../../../../lib/proxy.ts";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, {
    metodo: "GET", modelo: "/leads/:id/historico", ids: { id }, consulta: new URL(request.url).search,
  });
}
