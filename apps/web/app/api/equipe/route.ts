import { proxyar } from "../../lib/proxy";

/**
 * Espelha GET /equipe (lista e escopo de quem pede) sob a origem do web. Os
 * filtros seguem inteiros: quem os valida contra o catálogo é a API.
 */
export async function GET(request: Request): Promise<Response> {
  const { search } = new URL(request.url);
  return proxyar(request, { metodo: "GET", modelo: "equipe", consulta: search });
}
