import { proxyar } from "../../../lib/proxy";

/** Configurações da Engenharia (PLU-349): os tipos de O.S. com prazo padrão e quem agenda. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/configuracoes" });
}
