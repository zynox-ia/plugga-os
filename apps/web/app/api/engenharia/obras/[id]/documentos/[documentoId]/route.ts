import { proxyar } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string; documentoId: string }> };

/** Baixa uma versão do documento da obra, com os cabeçalhos seguros da API. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id, documentoId } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/obras/:id/documentos/:documentoId", ids: { id, documentoId }, resposta: "arquivo" });
}
