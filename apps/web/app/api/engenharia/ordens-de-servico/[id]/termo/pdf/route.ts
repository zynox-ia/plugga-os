import { proxyar } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** O PDF do termo (o gerado ou o assinado à parte). */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/ordens-de-servico/:id/termo/pdf", ids: { id }, resposta: "arquivo" });
}
