import { proxyar } from "../../../../lib/proxy";

/** Busca de clientes para a Nova O.S. (?busca=, ao menos 2 letras), com as UCs de cada um. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/ordens-de-servico/clientes", consulta: new URL(request.url).search });
}
