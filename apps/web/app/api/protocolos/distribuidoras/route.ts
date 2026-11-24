import { proxyApiMutation, proxyar } from "../../../lib/proxy";

/** Catálogo de distribuidoras (Configurações da Engenharia); criar é do gerente (a API confere). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/protocolos/distribuidoras" });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/protocolos/distribuidoras");
}
