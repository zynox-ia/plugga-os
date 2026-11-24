import { proxyar } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string; arquivoId: string }> };

/** Foto, assinatura ou PDF da O.S., em linha. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { id, arquivoId } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/engenharia/ordens-de-servico/:id/arquivos/:arquivoId", ids: { id, arquivoId }, resposta: "arquivo" });
}
