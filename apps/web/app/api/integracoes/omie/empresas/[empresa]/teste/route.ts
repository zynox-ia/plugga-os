import { proxyar } from "../../../../../../lib/proxy";
import { empresaDoOmieInvalida, ehEmpresaDoOmie } from "../../empresa";

/** Teste do par de uma empresa (ListarEmpresas no OMIE): só sai por clique de quem está na tela. */
export async function POST(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!ehEmpresaDoOmie(empresa)) return empresaDoOmieInvalida();
  return proxyar(request, { metodo: "POST", modelo: `integracoes/omie/empresas/${empresa}/teste`, corpo: "nenhum" });
}
