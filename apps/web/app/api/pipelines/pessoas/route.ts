import { proxyar } from "../../../lib/proxy";

/** Quem pode entrar na equipe de um pipeline da empresa (`?companyId=`). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/pipelines/pessoas", consulta: new URL(request.url).search });
}
