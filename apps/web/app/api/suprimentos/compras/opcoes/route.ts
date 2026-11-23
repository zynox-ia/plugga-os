import { proxyar } from "../../../../lib/proxy";

/** Pessoas, obras e fornecedores ativos para o formulário do pedido e da cotação. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/suprimentos/compras/opcoes" });
}
