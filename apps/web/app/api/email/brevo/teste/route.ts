import { proxyar } from "../../../../lib/proxy";

/** E-mail de teste do Brevo: só sai por clique do admin; a API devolve apenas o status. */
export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "email/brevo/teste" });
}
