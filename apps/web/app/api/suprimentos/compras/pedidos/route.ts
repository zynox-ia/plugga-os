import { proxyApiMutation, proxyar } from "../../../../lib/proxy";

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/pedidos", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/suprimentos/compras/pedidos");
}
