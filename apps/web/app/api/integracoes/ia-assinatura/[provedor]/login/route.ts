import { proxyar } from "../../../../../lib/proxy";

const PROVEDORES = new Set(["claude", "codex"]);

function provedorInvalido(): Response {
  return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Provedor desconhecido." }, { status: 400 });
}

/** Pede o link de login da assinatura ao proxy. */
export async function POST(request: Request, { params }: { params: Promise<{ provedor: string }> }): Promise<Response> {
  const { provedor } = await params;
  if (!PROVEDORES.has(provedor)) return provedorInvalido();
  return proxyar(request, { metodo: "POST", modelo: `integracoes/ia-assinatura/${provedor}/login`, corpo: "nenhum" });
}

/** Situação do login em andamento (`?estado=`): aguardando, concluído ou erro. */
export async function GET(request: Request, { params }: { params: Promise<{ provedor: string }> }): Promise<Response> {
  const { provedor } = await params;
  if (!PROVEDORES.has(provedor)) return provedorInvalido();
  const estado = new URL(request.url).searchParams.get("estado") ?? "";
  return proxyar(request, { metodo: "GET", modelo: `integracoes/ia-assinatura/${provedor}/login`, consulta: { estado } });
}
