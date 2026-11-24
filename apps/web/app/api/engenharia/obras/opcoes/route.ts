import { proxyar } from "../../../../lib/proxy";

/** Responsáveis e catálogos da Nova obra. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/obras/opcoes" });
}
