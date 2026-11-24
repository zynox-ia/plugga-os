import { proxyar } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** O print da conferência, em linha. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/monitoramento/conferencias/:id/print", ids: { id }, resposta: "arquivo" });
}
