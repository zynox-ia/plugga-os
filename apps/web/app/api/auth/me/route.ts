import { proxyAuthGet } from "../../../lib/auth-proxy";

/**
 * Espelha GET /auth/me da API sob a origem do web, para o menu do avatar
 * mostrar quem está logado sem o browser precisar falar direto com a API.
 */
export async function GET(request: Request): Promise<Response> {
  return proxyAuthGet(request, "me");
}
