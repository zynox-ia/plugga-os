import { proxyar } from "../../../../lib/proxy";

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/estoque/opcoes" });
}
