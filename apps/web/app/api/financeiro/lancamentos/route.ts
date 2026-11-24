import { proxyApiMutation, proxyar } from "../../../lib/proxy";

/** Lista dos lançamentos (com o resumo dos metric cards) e a nova conta a pagar avulsa (PLU-336). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/lancamentos", consulta: new URL(request.url).search });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/lancamentos");
}
