import { proxyar } from "../../../../lib/proxy";

/** Teste da conta do OMIE: só sai por clique do desenvolvedor; a API devolve a empresa dona da conta ou um texto fixo por motivo. */
export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "integracoes/omie/teste", corpo: "nenhum" });
}
