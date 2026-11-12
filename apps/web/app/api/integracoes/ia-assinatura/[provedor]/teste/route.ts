import { proxyar } from "../../../../../lib/proxy";

const PROVEDORES = new Set(["claude", "codex"]);

/** Confere a conexão listando os modelos do provedor no proxy. Não gasta cota da assinatura. */
export async function POST(request: Request, { params }: { params: Promise<{ provedor: string }> }): Promise<Response> {
  const { provedor } = await params;
  if (!PROVEDORES.has(provedor)) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Provedor desconhecido." }, { status: 400 });
  return proxyar(request, { metodo: "POST", modelo: `integracoes/ia-assinatura/${provedor}/teste`, corpo: "nenhum" });
}
