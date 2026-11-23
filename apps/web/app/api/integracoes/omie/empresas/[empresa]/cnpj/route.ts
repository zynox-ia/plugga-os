import { proxyar } from "../../../../../../lib/proxy";
import { empresaDoOmieInvalida, ehEmpresaDoOmie } from "../../empresa";

/** O CNPJ da empresa no cadastro do Plugga OS, contra o qual a conexão é conferida. Só Admin e Desenvolvedor (a API garante). */
export async function PUT(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const { empresa } = await params;
  if (!ehEmpresaDoOmie(empresa)) return empresaDoOmieInvalida();
  return proxyar(request, { metodo: "PUT", modelo: `integracoes/omie/empresas/${empresa}/cnpj` });
}
