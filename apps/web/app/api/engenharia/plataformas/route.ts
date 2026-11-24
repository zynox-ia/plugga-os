import { proxyApiMutation, proxyar } from "../../../lib/proxy";

/** Plataformas de inversor (Configurações da Engenharia, PLU-347). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/plataformas" });
}

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/engenharia/plataformas");
}
