import { proxyar } from "../../../../../lib/proxy";

const PROVEDORES = new Set(["claude", "codex"]);

/** Remove uma conta (`?arquivo=`). A API confere que o arquivo é do provedor antes de pedir a remoção ao proxy. */
export async function DELETE(request: Request, { params }: { params: Promise<{ provedor: string }> }): Promise<Response> {
  const { provedor } = await params;
  if (!PROVEDORES.has(provedor)) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Provedor desconhecido." }, { status: 400 });
  const arquivo = new URL(request.url).searchParams.get("arquivo") ?? "";
  return proxyar(request, { metodo: "DELETE", modelo: `integracoes/ia-assinatura/${provedor}/contas`, consulta: { arquivo } });
}
