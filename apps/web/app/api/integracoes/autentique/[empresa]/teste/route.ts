import { proxyar } from "../../../../../lib/proxy";

const EMPRESAS = new Set(["plugga", "waze"]);

/** Teste da conta da Autentique de uma empresa: só sai por clique do desenvolvedor. */
export async function POST(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!EMPRESAS.has(empresa)) {
    return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Empresa desconhecida." }, { status: 400 });
  }
  return proxyar(request, { metodo: "POST", modelo: `integracoes/autentique/${empresa}/teste`, corpo: "nenhum" });
}
