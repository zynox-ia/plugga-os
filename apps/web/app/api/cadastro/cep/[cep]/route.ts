import { proxyar } from "../../../../lib/proxy";

/** Consulta de CEP para as telas: o web valida o formato (8 dígitos) e a API decide o resto. */
export async function GET(request: Request, { params }: { params: Promise<{ cep: string }> }): Promise<Response> {
  const digitos = (await params).cep.replace(/\D/g, "");
  if (digitos.length !== 8) {
    return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "CEP inválido: informe os 8 dígitos." }, { status: 400 });
  }
  return proxyar(request, { metodo: "GET", modelo: `cadastro/cep/${digitos}` });
}
