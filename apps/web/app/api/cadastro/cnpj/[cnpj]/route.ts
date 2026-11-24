import { proxyar } from "../../../../lib/proxy";

/**
 * Consulta de CNPJ para as telas. O web valida só o formato (14 dígitos, com ou
 * sem máscara) antes de repassar; quem confere os verificadores e se a
 * integração está ligada é a API.
 */
export async function GET(request: Request, { params }: { params: Promise<{ cnpj: string }> }): Promise<Response> {
  const digitos = (await params).cnpj.replace(/\D/g, "");
  if (digitos.length !== 14) {
    return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "CNPJ inválido: confira os 14 dígitos." }, { status: 400 });
  }
  return proxyar(request, { metodo: "GET", modelo: `cadastro/cnpj/${digitos}` });
}
