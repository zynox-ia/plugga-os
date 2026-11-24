import { proxyApiMutation, proxyar } from "../../../lib/proxy";

/** Obras (PLU-350): a lista para o navegador (a tela lê no servidor) e a nova obra. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/obras", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/engenharia/obras");
}
