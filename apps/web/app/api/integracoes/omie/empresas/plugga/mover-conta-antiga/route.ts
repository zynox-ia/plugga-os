import { proxyar } from "../../../../../../lib/proxy";

/** Testa a conta única de antes e a grava como o par da Plugga; só sai por clique de quem está na tela. */
export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "integracoes/omie/empresas/plugga/mover-conta-antiga", corpo: "nenhum" });
}
