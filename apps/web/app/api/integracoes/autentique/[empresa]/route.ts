import { proxyar } from "../../../../lib/proxy";

/**
 * A conta da Autentique de uma empresa sob a origem do web. O web só confere que a
 * empresa é uma das conhecidas antes de repassar; a API decide o acesso (só
 * desenvolvedor). O corpo do PUT carrega o token em claro: por isso esta rota
 * nunca registra o corpo em log, nem em erro.
 */
const EMPRESAS = new Set(["plugga", "waze"]);

function empresaInvalida(): Response {
  return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Empresa desconhecida." }, { status: 400 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!EMPRESAS.has(empresa)) return empresaInvalida();
  return proxyar(request, { metodo: "PUT", modelo: `integracoes/autentique/${empresa}` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!EMPRESAS.has(empresa)) return empresaInvalida();
  return proxyar(request, { metodo: "DELETE", modelo: `integracoes/autentique/${empresa}` });
}
