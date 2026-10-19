import { proxyar } from "../../../lib/proxy";

/** Checagem de duplicidade enquanto o formulário é preenchido (documento, telefone, e-mail, nome). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/clientes/duplicates", consulta: new URL(request.url).search });
}
