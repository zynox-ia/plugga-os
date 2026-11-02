import { proxyar } from "../../../lib/proxy";

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "clientes/selecao-negocio", consulta: new URL(request.url).search });
}
