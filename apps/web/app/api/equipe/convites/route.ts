import { proxyar } from "../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "equipe/convites" });
}
