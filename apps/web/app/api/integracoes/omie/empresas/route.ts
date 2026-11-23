import { proxyar } from "../../../../lib/proxy";

/**
 * O estado das conexões do OMIE, uma por empresa (PLU-342). A API decide o
 * acesso: Desenvolvedor, Admin e Gerente do Financeiro.
 */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "integracoes/omie/empresas" });
}
