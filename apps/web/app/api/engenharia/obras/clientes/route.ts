import { proxyar } from "../../../../lib/proxy";

/** Busca de clientes da Nova obra (?busca=, ao menos 2 letras); exige a tela de Obras. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/obras/clientes", consulta: new URL(request.url).search });
}
