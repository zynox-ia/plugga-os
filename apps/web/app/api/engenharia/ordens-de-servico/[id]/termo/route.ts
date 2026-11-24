import { proxyar } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Termo assinado na tela (multipart: modo, nome, documento e o PNG `assinatura` na desenhada); conclui a O.S. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/engenharia/ordens-de-servico/:id/termo", ids: { id }, corpo: "multipart" });
}
