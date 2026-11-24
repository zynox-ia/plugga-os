import { proxyar, proxyApiMutation } from "../../lib/proxy.ts";

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/atividades", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/atividades");
}
