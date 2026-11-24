import { proxyApiMutation } from "../../../lib/proxy";

/** Nova O.S. (PLU-345). As leituras da lista, do quadro e das opções são do servidor (lib/api.ts). */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/engenharia/ordens-de-servico");
}
