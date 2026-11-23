import { proxyar } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/pedidos/:id/comprovante", ids: { id }, resposta: "arquivo" });
}

/** Comprovante do pagamento (multipart, campo `arquivo`), antes de registrar o pagamento. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/suprimentos/compras/pedidos/:id/comprovante", ids: { id }, corpo: "multipart" });
}
