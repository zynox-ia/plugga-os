import { proxyar } from "../../../lib/proxy";

/** Distribuidoras, tipos, situações e os departamentos que a pessoa alcança nos protocolos. */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/protocolos/opcoes" });
}
