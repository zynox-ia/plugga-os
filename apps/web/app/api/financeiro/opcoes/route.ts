import { proxyar } from "../../../lib/proxy";

/** Categorias e contas correntes por empresa, fornecedores ativos e formas de pagamento. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/opcoes" });
}
