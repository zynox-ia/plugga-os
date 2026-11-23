import { proxyar } from "../../../lib/proxy";

/** O monitoramento do dia, para o navegador (a tela lê no servidor). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/monitoramento", consulta: new URL(request.url).search });
}
