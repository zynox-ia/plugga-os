import { proxyApiMutation, proxyar } from "../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/clientes");
}

/** Busca de clientes enquanto se digita (formulário do negócio). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/clientes", consulta: new URL(request.url).search });
}
