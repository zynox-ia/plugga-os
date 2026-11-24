import { proxyApiMutation, proxyar } from "../../lib/proxy";

/** Protocolos na distribuidora (PLU-348): a lista para o navegador (a tela lê no servidor) e o novo protocolo. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/protocolos", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/protocolos");
}
