import { proxyar } from "../../../../lib/proxy.ts";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/leads/:id/propostas", ids: { id } });
}

export async function POST(request: Request, { params }: Contexto) {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/leads/:id/propostas", ids: { id }, tempoMaximoMs: 60_000 });
}
