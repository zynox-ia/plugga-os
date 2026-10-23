import { proxyar } from "../../../../../lib/proxy";

/** Contatos e UCs do cliente, para o formulário do negócio. */
export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }): Promise<Response> {
  const { clientId } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/negocios/clientes/:clientId/opcoes", ids: { clientId } });
}
