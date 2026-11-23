import { proxyApiMutation, proxyar } from "../../../lib/proxy";

/** Usinas (PLU-347): a lista para o navegador (a tela lê no servidor) e a nova usina. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/usinas", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/engenharia/usinas");
}
