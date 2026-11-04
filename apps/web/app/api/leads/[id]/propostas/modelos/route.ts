import { proxyar } from "../../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/leads/:id/propostas/modelos", ids: { id } });
}
