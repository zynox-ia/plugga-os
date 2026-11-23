import { proxyar } from "../../../../../../lib/proxy";
import { empresaDoOmieInvalida, ehEmpresaDoOmie } from "../../empresa";

/** Confirma a empresa que o teste devolveu, com o CNPJ que a pessoa viu na tela. */
export async function POST(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!ehEmpresaDoOmie(empresa)) return empresaDoOmieInvalida();
  return proxyar(request, { metodo: "POST", modelo: `integracoes/omie/empresas/${empresa}/confirmar` });
}
