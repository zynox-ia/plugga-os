import { proxyar } from "../../../../lib/proxy";

const PROVEDORES = new Set(["claude", "codex"]);

/** Estado da IA pela assinatura de um provedor (proxy e contas). A API decide o acesso (só desenvolvedor). */
export async function GET(request: Request, { params }: { params: Promise<{ provedor: string }> }): Promise<Response> {
  const { provedor } = await params;
  if (!PROVEDORES.has(provedor)) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Provedor desconhecido." }, { status: 400 });
  return proxyar(request, { metodo: "GET", modelo: `integracoes/ia-assinatura/${provedor}` });
}
