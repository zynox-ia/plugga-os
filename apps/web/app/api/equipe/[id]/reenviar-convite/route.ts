import { proxyar } from "../../../../lib/proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "equipe/:id/reenviar-convite", ids: { id } });
}
