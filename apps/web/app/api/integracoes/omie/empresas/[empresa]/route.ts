import { proxyar } from "../../../../../lib/proxy";
import { empresaDoOmieInvalida, ehEmpresaDoOmie } from "../empresa";

/**
 * O par chave e segredo do OMIE de uma empresa. O corpo do PUT carrega o segredo
 * em claro: esta rota nunca o registra em log nem em erro. A API decide o acesso.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!ehEmpresaDoOmie(empresa)) return empresaDoOmieInvalida();
  return proxyar(request, { metodo: "PUT", modelo: `integracoes/omie/empresas/${empresa}` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!ehEmpresaDoOmie(empresa)) return empresaDoOmieInvalida();
  return proxyar(request, { metodo: "DELETE", modelo: `integracoes/omie/empresas/${empresa}` });
}
