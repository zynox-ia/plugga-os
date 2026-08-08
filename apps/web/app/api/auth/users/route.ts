import { proxyAuthGet } from "../../../lib/auth-proxy";

/**
 * Espelha GET /auth/users (lista da equipe) sob a origem do web. Os filtros
 * seguem inteiros para a API: quem valida empresa, departamento e status contra
 * o catálogo é ela, e um segundo validador aqui só criaria duas versões da
 * mesma regra.
 */
export async function GET(request: Request): Promise<Response> {
  const { search } = new URL(request.url);
  return proxyAuthGet(request, `users${search}`);
}
