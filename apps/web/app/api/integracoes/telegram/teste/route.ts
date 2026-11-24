import { proxyar } from "../../../../lib/proxy";

/** Mensagem de teste do Telegram: só sai por clique do desenvolvedor; a API devolve apenas um texto fixo por motivo. */
export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "integracoes/telegram/teste", corpo: "nenhum" });
}
