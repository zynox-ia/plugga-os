import { proxyar } from "../../../../../../lib/proxy";

/** Cotação com o anexo (multipart, campo `arquivo`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/suprimentos/compras/pedidos/:id/cotacoes", ids: { id }, corpo: "multipart" });
}
