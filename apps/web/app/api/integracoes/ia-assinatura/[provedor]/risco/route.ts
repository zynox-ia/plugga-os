import { proxyar } from "../../../../../lib/proxy";

const PROVEDORES = new Set(["claude", "codex"]);

/** Registra que o desenvolvedor entende o risco de usar a assinatura por este caminho. Exigido antes do login. */
export async function POST(request: Request, { params }: { params: Promise<{ provedor: string }> }): Promise<Response> {
  const { provedor } = await params;
  if (!PROVEDORES.has(provedor)) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Provedor desconhecido." }, { status: 400 });
  return proxyar(request, { metodo: "POST", modelo: `integracoes/ia-assinatura/${provedor}/risco`, corpo: "nenhum" });
}
