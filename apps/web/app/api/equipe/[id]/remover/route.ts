import { proxyar } from "../../../../lib/proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "equipe/:id/remover", ids: await params });
}
