import { proxyApiMutation, proxyar } from "../../../lib/proxy";

/** Lista com busca, situação e categoria (e a conferência de documento repetido do formulário). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/fornecedores", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/suprimentos/fornecedores");
}
