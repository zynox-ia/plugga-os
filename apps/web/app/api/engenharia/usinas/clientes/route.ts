import { proxyar } from "../../../../lib/proxy";

/** Busca de clientes da Nova usina (?busca=, ao menos 2 letras), com as UCs de cada um; exige a tela de Usinas. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/usinas/clientes", consulta: new URL(request.url).search });
}
